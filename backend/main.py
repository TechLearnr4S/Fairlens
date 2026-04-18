from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import io
import json
import uuid
import time
import logging

logger = logging.getLogger(__name__)

from fairness_engine import compute_disparities
from proxy_detector import identify_proxies
from llm_explainer import generate_fairness_explanation, generate_proxy_explanation
from governance import generate_audit_receipt, generate_fairness_passport
from bias_simulator import simulate_threshold_adjustment
from correlation_engine import run_correlation_analysis, compute_proxy_risk
from firebase_client import (
    download_dataset_as_dataframe,
    get_audit_config,
    save_proxy_flags,
    get_proxy_flags,
    save_proxy_explanation,
)
from services.agent_orchestrator import run_fairness_copilot

# In-memory storage for MVP (In production, load from Cloud Storage/Firestore)
# Format: { job_id: {"df": DataFrame, "results": dict, "config": dict} }
LOCAL_DATASTORE = {}

app = FastAPI(title="FairLens Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate Limiting ──────────────────────────────────────────────────────────
RATE_LIMIT_STORE = {} # {client_id: [timestamps]}
MAX_REQUESTS = 5
WINDOW_SECONDS = 60

def check_rate_limit(client_id: str):
    now = time.time()
    if client_id not in RATE_LIMIT_STORE:
        RATE_LIMIT_STORE[client_id] = []
    
    # Filter out timestamps outside the window
    RATE_LIMIT_STORE[client_id] = [ts for ts in RATE_LIMIT_STORE[client_id] if now - ts < WINDOW_SECONDS]
    
    if len(RATE_LIMIT_STORE[client_id]) >= MAX_REQUESTS:
        return False
    
    RATE_LIMIT_STORE[client_id].append(now)
    return True

@app.get("/")
def read_root():
    return {"status": "ok", "message": "FairLens Studio API backend running"}

@app.post("/audits/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    contents = await file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
        columns = df.columns.tolist()
        
        job_id = str(uuid.uuid4())
        LOCAL_DATASTORE[job_id] = {
            "df": df,
            "filename": file.filename,
            "results": {},
            "config": {}
        }
        
        return {
            "job_id": job_id,
            "filename": file.filename,
            "columns": columns,
            "row_count": len(df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {str(e)}")

class AuditRunRequest(BaseModel):
    target_column: str
    protected_attributes: list[str]

@app.post("/audits/{job_id}/run")
async def run_audit(job_id: str, payload: AuditRunRequest):
    if job_id not in LOCAL_DATASTORE:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    df = LOCAL_DATASTORE[job_id]["df"]
    
    try:
        disparities = compute_disparities(df, payload.target_column, payload.protected_attributes)
        proxies = identify_proxies(df, payload.protected_attributes, top_n=3)
        
        # Save results for subsequent calls
        LOCAL_DATASTORE[job_id]["results"] = {
            "disparities": disparities,
            "proxies": proxies
        }
        LOCAL_DATASTORE[job_id]["config"] = {
            "target": payload.target_column,
            "protected": payload.protected_attributes
        }
        
        return {
            "status": "success",
            "job_id": job_id,
            "disparities": disparities,
            "proxies": proxies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/audits/{job_id}/explain")
async def explain_audit(job_id: str):
    if job_id not in LOCAL_DATASTORE or not LOCAL_DATASTORE[job_id]["results"]:
        raise HTTPException(status_code=404, detail="Audit results not found")
        
    res = LOCAL_DATASTORE[job_id]["results"]
    explanation = generate_fairness_explanation(res["disparities"], res["proxies"])
    LOCAL_DATASTORE[job_id]["results"]["explanation"] = explanation
    
    return explanation

@app.post("/audits/{job_id}/simulate")
async def simulate_mitigation(job_id: str):
    if job_id not in LOCAL_DATASTORE or "target" not in LOCAL_DATASTORE[job_id]["config"]:
        raise HTTPException(status_code=404, detail="Audit config not found")
        
    data = LOCAL_DATASTORE[job_id]
    simulation = simulate_threshold_adjustment(
        data["df"], 
        data["config"]["target"], 
        data["config"]["protected"]
    )
    LOCAL_DATASTORE[job_id]["results"]["simulation"] = simulation
    
    return simulation

@app.get("/audits/{job_id}/passport")
async def get_passport(job_id: str):
    if job_id not in LOCAL_DATASTORE or not LOCAL_DATASTORE[job_id]["results"]:
        raise HTTPException(status_code=404, detail="Audit results not found")
        
    data = LOCAL_DATASTORE[job_id]
    receipt = generate_audit_receipt(
        job_id, data["filename"], data["config"]["target"], 
        data["config"]["protected"], data["results"]["disparities"], data["results"]["proxies"]
    )
    
    markdown = generate_fairness_passport(
        job_id, data["filename"], data["config"]["target"], 
        data["config"]["protected"], data["results"]["disparities"], 
        data["results"]["proxies"], data["results"].get("explanation"), 
        receipt["signature_hash"], data["results"].get("simulation")
    )
    
    return {
        "receipt": receipt,
        "markdown": markdown,
        "job_id": job_id
    }


# ---------------------------------------------------------------------------
# Proxy Bias Hunter — Correlation Analysis
# ---------------------------------------------------------------------------

class CorrelationRequest(BaseModel):
    protected_attributes: list[str]
    target_column: str | None = None

@app.post("/audits/{job_id}/correlations")
async def compute_correlations(job_id: str, payload: CorrelationRequest):
    """
    Compute per-feature correlation scores against every specified protected
    attribute using the correlation_engine module.

    Returns
    -------
    JSON: { protected_attr: { feature: { type, correlation_score, method } } }
    """
    if job_id not in LOCAL_DATASTORE:
        raise HTTPException(status_code=404, detail="Dataset not found. Upload a CSV first.")

    df = LOCAL_DATASTORE[job_id]["df"]

    if not payload.protected_attributes:
        raise HTTPException(status_code=400, detail="At least one protected attribute is required.")

    missing = [a for a in payload.protected_attributes if a not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Protected attributes not found in dataset: {missing}",
        )

    try:
        correlation_results = run_correlation_analysis(
            df=df,
            protected_attrs=payload.protected_attributes,
            target_col=payload.target_column,
        )

        # Persist so other endpoints (passport, explain) can reference it
        LOCAL_DATASTORE[job_id]["results"]["correlations"] = correlation_results

        return {
            "status": "success",
            "job_id": job_id,
            "correlations": correlation_results,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Correlation analysis failed: {str(exc)}")


@app.post("/audits/{job_id}/proxy-risks")
async def get_proxy_risks(job_id: str, payload: CorrelationRequest):
    """
    Compute proxy risk scores for every feature in the dataset.

    This endpoint runs the full correlation analysis (if not already cached)
    and then aggregates the results into a ranked list of proxy-risk entries.

    Returns
    -------
    JSON:
        {
          "status": "success",
          "job_id": "...",
          "proxy_risks": [
            { "feature": "zip_code", "score": 0.72, "risk_level": "High",
              "is_proxy": true, "type": "categorical", "method": "mi",
              "max_protected": "race" },
            ...
          ]
        }
    """
    if job_id not in LOCAL_DATASTORE:
        raise HTTPException(status_code=404, detail="Dataset not found. Upload a CSV first.")

    df = LOCAL_DATASTORE[job_id]["df"]

    if not payload.protected_attributes:
        raise HTTPException(status_code=400, detail="At least one protected attribute is required.")

    missing = [a for a in payload.protected_attributes if a not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Protected attributes not found in dataset: {missing}",
        )

    try:
        # Reuse cached correlations if available, otherwise compute fresh
        cached = LOCAL_DATASTORE[job_id]["results"].get("correlations")
        if cached:
            correlation_results = cached
        else:
            correlation_results = run_correlation_analysis(
                df=df,
                protected_attrs=payload.protected_attributes,
                target_col=payload.target_column,
            )
            LOCAL_DATASTORE[job_id]["results"]["correlations"] = correlation_results

        # Derive ranked proxy-risk list
        proxy_risks = compute_proxy_risk(correlation_results)

        # Persist for downstream endpoints (passport, explain)
        LOCAL_DATASTORE[job_id]["results"]["proxy_risks"] = proxy_risks

        return {
            "status": "success",
            "job_id": job_id,
            "proxy_risks": proxy_risks,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Proxy risk analysis failed: {str(exc)}")


@app.post("/audits/{job_id}/proxy-explain")
async def explain_proxy_risks(job_id: str):
    """
    Generate an AI explanation for the detected proxy risks.
    """
    if not check_rate_limit(job_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a minute.")

    if job_id not in LOCAL_DATASTORE or "proxy_risks" not in LOCAL_DATASTORE[job_id]["results"]:
        raise HTTPException(status_code=404, detail="Proxy risk results not found. Run analysis first.")

    proxy_risks = LOCAL_DATASTORE[job_id]["results"]["proxy_risks"]
    
    try:
        explanation = generate_proxy_explanation(proxy_risks)
        LOCAL_DATASTORE[job_id]["results"]["proxy_explanation"] = explanation
        return explanation
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI explanation failed: {str(e)}")


# ---------------------------------------------------------------------------
# Proxy Bias Hunter — Firebase-Integrated Detection
# ---------------------------------------------------------------------------

@app.post("/audits/{audit_id}/proxy-detection")
async def proxy_detection(audit_id: str):
    """
    End-to-end Proxy Bias Hunter pipeline backed by Firebase.

    Steps
    -----
    1. Load audit config from Firestore  (``audits/{audit_id}``).
    2. Download dataset CSV from Firebase Storage.
    3. Run correlation analysis + proxy risk scoring.
    4. Persist every proxy flag to Firestore (``proxy_flags``).
    5. Return ranked proxy list + summary.

    Expected Firestore audit document::

        {
          "dataset_path": "uploads/abc123/dataset.csv",
          "target_column": "loan_approved",
          "protected_attributes": ["gender", "race"],
          ...
        }

    Returns
    -------
    JSON::

        {
          "status": "success",
          "audit_id": "...",
          "proxy_risks": [ ... ],
          "summary": {
            "total_features_analyzed": int,
            "high_risk_count": int,
            "medium_risk_count": int,
            "low_risk_count": int,
            "proxy_count": int,
            "top_proxy": str | null
          }
        }
    """
    # ── 1. Load audit config from Firestore ────────────────────────────────
    try:
        config = get_audit_config(audit_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    dataset_path: str = config["dataset_path"]
    protected_attrs: list[str] = config["protected_attributes"]
    target_col: str | None = config.get("target_column")

    if not protected_attrs:
        raise HTTPException(
            status_code=400,
            detail="No protected attributes configured for this audit.",
        )

    # ── 2. Download dataset from Firebase Storage ─────────────────────────
    try:
        df = download_dataset_as_dataframe(dataset_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Validate that the expected columns exist
    missing_attrs = [a for a in protected_attrs if a not in df.columns]
    if missing_attrs:
        raise HTTPException(
            status_code=400,
            detail=f"Protected attributes not found in dataset: {missing_attrs}",
        )
    if target_col and target_col not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Target column '{target_col}' not found in dataset.",
        )

    # ── 3. Run correlation engine + proxy risk scoring ────────────────────
    try:
        correlations = run_correlation_analysis(
            df=df,
            protected_attrs=protected_attrs,
            target_col=target_col,
        )
        proxy_risks = compute_proxy_risk(correlations)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Proxy detection analysis failed: {exc}",
        )

    # ── 4. Persist results to Firestore ───────────────────────────────────
    try:
        save_proxy_flags(audit_id, proxy_risks)
    except Exception as exc:
        # Non-fatal: log but still return results to the caller
        logger.error("Failed to persist proxy flags to Firestore: %s", exc)

    # ── 5. Build summary & respond ────────────────────────────────────────
    high  = sum(1 for r in proxy_risks if r["risk_level"] == "High")
    med   = sum(1 for r in proxy_risks if r["risk_level"] == "Medium")
    low   = sum(1 for r in proxy_risks if r["risk_level"] == "Low")
    proxies_flagged = sum(1 for r in proxy_risks if r.get("is_proxy"))
    top_proxy = proxy_risks[0]["feature"] if proxy_risks else None

    return {
        "status": "success",
        "audit_id": audit_id,
        "proxy_risks": proxy_risks,
        "summary": {
            "total_features_analyzed": len(proxy_risks),
            "high_risk_count": high,
            "medium_risk_count": med,
            "low_risk_count": low,
            "proxy_count": proxies_flagged,
            "top_proxy": top_proxy,
        },
    }


@app.post("/audits/{audit_id}/proxy-explain-firebase")
async def explain_proxy_bias_firebase(audit_id: str):
    """
    Generate an AI explanation for proxy bias using Firestore data.
    """
    if not check_rate_limit(audit_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a minute.")

    # ── 1. Fetch historical results from Firestore ────────────────────────
    try:
        proxy_results = get_proxy_flags(audit_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve results from Firestore: {exc}",
        )

    if not proxy_results:
        raise HTTPException(
            status_code=404,
            detail=f"No proxy analysis results found for audit ID '{audit_id}'. Run detection first.",
        )

    # ── 2. Generate AI Explanation ────────────────────────────────────────
    try:
        explanation_text = generate_proxy_explanation(proxy_results)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI Explanation generation failed: {exc}",
        )

    # ── 3. Persist narrative to Firestore ──────────────────────────────────
    try:
        save_proxy_explanation(audit_id, explanation_text)
    except Exception as exc:
        # Non-fatal: Log the error and still return the text to the user
        logger.error("Failed to persist proxy explanation to Firestore: %s", exc)

    return {
        "status": "success",
        "audit_id": audit_id,
        "explanation": explanation_text,
    }


@app.post("/audits/{audit_id}/copilot")
async def run_fairness_copilot_api(audit_id: str):
    """
    Trigger the Multi-Agent Fairness Copilot pipeline.
    Coordinates specialized AI agents for a unified intelligence report.
    """
    if not check_rate_limit(audit_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a minute.")

    try:
        report = await run_fairness_copilot(audit_id)
        if "error" in report:
            raise HTTPException(status_code=400, detail=report["error"])
        return report
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Multi-agent orchestration failed: {e}",
        )
