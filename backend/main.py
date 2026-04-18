from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import concurrent.futures
from datetime import datetime
import io
import json
import logging
import os
import uuid
import time
import pandas as pd

# ── Structured logging ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

from fairness_engine import compute_disparities
from proxy_detector import identify_proxies
from llm_explainer import generate_fairness_explanation, generate_proxy_explanation
from governance import generate_audit_receipt, generate_fairness_passport, build_fairness_passport
from bias_simulator import simulate_mitigation_enhanced
from correlation_engine import run_correlation_analysis, compute_proxy_risk
from firebase_client import (
    download_dataset_as_dataframe,
    get_audit_config,
    save_proxy_flags,
    get_proxy_flags,
    save_proxy_explanation,
)
from services.agent_orchestrator import run_fairness_copilot
from audit_log import append_audit_log, get_audit_chain, verify_chain, run_verification_engine
from signing import get_public_key_pem, get_public_key_hex
from cache import cache_get, cache_set, cache_stats
from validation import validate_dataset, validate_audit_config, sanitize_string

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
    return {
        "status": "ok",
        "message": "FairLens Studio API",
        "cache": cache_stats(),
    }

@app.post("/audits/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    contents = await file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {e}")

    # Validate dataset
    try:
        warnings = validate_dataset(df, file.filename or "unknown")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    columns = df.columns.tolist()
    job_id  = str(uuid.uuid4())

    LOCAL_DATASTORE[job_id] = {
        "df":          df,
        "filename":    sanitize_string(file.filename or "unknown"),
        "results":     {},
        "config":      {},
        "row_count":   len(df),
        "upload_time": datetime.utcnow().isoformat() + "Z",
    }
    logger.info("UPLOAD | job_id=%s filename=%s rows=%d cols=%d",
                job_id, file.filename, len(df), len(df.columns))

class AuditRunRequest(BaseModel):
    target_column: str
    protected_attributes: list[str]

class SimulationRequest(BaseModel):
    method: str
    params: dict = {}

@app.post("/audits/{job_id}/run")
async def run_audit(job_id: str, payload: AuditRunRequest):
    if job_id not in LOCAL_DATASTORE:
        raise HTTPException(status_code=404, detail="Dataset not found")

    logger.info("AUDIT_RUN START | job_id=%s target=%s", job_id, payload.target_column)
    df = LOCAL_DATASTORE[job_id]["df"]

    # Validate config
    try:
        config_warnings = validate_audit_config(df, payload.target_column, payload.protected_attributes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Cache check
    cache_params = {"target": payload.target_column, "protected": sorted(payload.protected_attributes)}
    cached = cache_get(job_id, "audit_run", cache_params)
    if cached:
        logger.info("AUDIT_RUN cache hit | job_id=%s", job_id)
        return {**cached, "cached": True}

    try:
        # Run fairness + proxy detection concurrently
        loop = asyncio.get_event_loop()
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

        disp_future = loop.run_in_executor(
            executor, compute_disparities, df, payload.target_column, payload.protected_attributes
        )
        prox_future = loop.run_in_executor(
            executor, identify_proxies, df, payload.protected_attributes, 3
        )
        disparities, proxies = await asyncio.gather(disp_future, prox_future)

        LOCAL_DATASTORE[job_id]["results"] = {"disparities": disparities, "proxies": proxies}
        LOCAL_DATASTORE[job_id]["config"]  = {
            "target":    payload.target_column,
            "protected": payload.protected_attributes,
        }
        LOCAL_DATASTORE[job_id]["analysis_time"] = datetime.utcnow().isoformat() + "Z"

        result = {
            "status":     "success",
            "job_id":     job_id,
            "disparities": disparities,
            "proxies":    proxies,
            "warnings":   config_warnings,
        }
        cache_set(job_id, "audit_run", result, cache_params)

        # Audit log
        try:
            append_audit_log(
                audit_id=job_id, action="FAIRNESS_RUN",
                metadata={
                    "target_column":         payload.target_column,
                    "protected_attributes":  payload.protected_attributes,
                    "attributes_scanned":    len(disparities),
                    "proxies_found":         len(proxies),
                },
            )
        except Exception:
            pass

        logger.info("AUDIT_RUN END | job_id=%s disparities=%d proxies=%d",
                    job_id, len(disparities), len(proxies))
        return result

    except Exception as e:
        logger.error("AUDIT_RUN FAILED | job_id=%s error=%s", job_id, e)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")

@app.post("/audits/{job_id}/explain")
async def explain_audit(job_id: str):
    if job_id not in LOCAL_DATASTORE or not LOCAL_DATASTORE[job_id]["results"]:
        raise HTTPException(status_code=404, detail="Audit results not found")
        
    res = LOCAL_DATASTORE[job_id]["results"]
    explanation = generate_fairness_explanation(res["disparities"], res["proxies"])
    LOCAL_DATASTORE[job_id]["results"]["explanation"] = explanation
    LOCAL_DATASTORE[job_id]["explain_time"] = datetime.utcnow().isoformat() + "Z"

    # Hash-chained log: explanation generated
    try:
        append_audit_log(
            audit_id=job_id,
            action="EXPLANATION_GENERATED",
            metadata={"generator": "Gemini AI Auditor"},
        )
    except Exception:
        pass

    return explanation

@app.post("/audits/{job_id}/simulate")
async def simulate_mitigation(job_id: str, payload: SimulationRequest):
    if job_id not in LOCAL_DATASTORE or "target" not in LOCAL_DATASTORE[job_id]["config"]:
        raise HTTPException(status_code=404, detail="Audit config not found. Run the audit first.")
        
    data = LOCAL_DATASTORE[job_id]
    simulation = simulate_mitigation_enhanced(
        job_id,
        data["df"], 
        data["config"]["target"], 
        data["config"]["protected"],
        payload.method,
        payload.params
    )
    
    if "error" in simulation:
        raise HTTPException(status_code=400, detail=simulation["error"])

    LOCAL_DATASTORE[job_id]["results"]["simulation"] = simulation
    LOCAL_DATASTORE[job_id]["simulation_time"] = datetime.utcnow().isoformat() + "Z"

    # Hash-chained log: simulation applied
    try:
        delta = simulation.get("delta", {})
        append_audit_log(
            audit_id=job_id,
            action="SIMULATION_APPLIED",
            metadata={
                "method": payload.method,
                "params": payload.params,
                "bias_reduction_pct": delta.get("disparity_reduction_pct", 0),
                "accuracy_change_pct": delta.get("accuracy_change_pct", 0),
            },
        )
    except Exception:
        pass

    return simulation

@app.get("/audits/{job_id}/passport")
async def get_passport(job_id: str):
    if job_id not in LOCAL_DATASTORE or not LOCAL_DATASTORE[job_id]["results"]:
        raise HTTPException(status_code=404, detail="Audit results not found. Run the audit first.")

    data = LOCAL_DATASTORE[job_id]

    # --- Build structured v2 passport ---
    try:
        passport = build_fairness_passport(job_id, data)
    except Exception as e:
        logger.error("Passport build failed for job_id=%s: %s", job_id, str(e))
        # Graceful fallback passport so the API never returns 500 for a UI request
        passport = {
            "job_id": job_id,
            "schema_version": "2.0",
            "error": "Passport generation encountered an issue.",
            "model_info": {"dataset": data.get("filename", "unknown"), "use_case": "N/A", "target": "N/A", "created_at": ""},
            "fairness_summary": {"key_metrics": {}, "affected_groups": [], "disparity_by_attribute": {}},
            "proxy_risks": [],
            "mitigation": {"methods_applied": [], "bias_reduction_pct": 0, "accuracy_tradeoff_pct": 0, "impact_summary": "N/A"},
            "risk_assessment": {"risk_level": "Unknown", "risk_score": 0.0, "components": {}},
            "decision": {"status": "Unknown", "confidence": 0.0, "reason": str(e), "summary": "Passport generation failed."},
            "audit_trace": {"steps": [], "timestamped_events": []},
            "ai_insights": "N/A",
        }

    # --- Persist to Firestore (non-blocking; failure does not break response) ---
    try:
        from firebase_client import get_firestore_client
        from datetime import datetime, timezone
        db = get_firestore_client()
        now = datetime.now(timezone.utc)
        db.collection("fairness_passports").document(job_id).set({
            **{k: v for k, v in passport.items() if k != "audit_trace"},
            "audit_trace_steps": passport.get("audit_trace", {}).get("steps", []),
            "job_id": job_id,
            "created_at": now,
        })
        logger.info("Passport saved to Firestore for job_id=%s", job_id)
    except Exception as fs_err:
        logger.warning("Firestore save skipped for job_id=%s: %s", job_id, str(fs_err))

    # Hash-chained log: passport generated
    try:
        append_audit_log(
            audit_id=job_id,
            action="PASSPORT_GENERATED",
            metadata={
                "schema_version": passport.get("schema_version", "2.0"),
                "decision": passport.get("decision", {}).get("status", "Unknown"),
                "risk_level": passport.get("risk_assessment", {}).get("risk_level", "Unknown"),
                "risk_score": passport.get("risk_assessment", {}).get("risk_score", 0.0),
            },
        )
    except Exception:
        pass

    return passport


# ---------------------------------------------------------------------------
# Hash-Chained Audit Logs
# ---------------------------------------------------------------------------

@app.get("/audits/{job_id}/logs")
async def get_audit_logs(job_id: str):
    """
    Retrieve the complete hash-chained audit log for a given job, in
    chronological order.  Each entry contains its SHA-256 hash and the
    hash of the previous entry so the caller can independently verify
    chain integrity.
    """
    chain = get_audit_chain(job_id)
    return {
        "job_id": job_id,
        "total_entries": len(chain),
        "chain": chain,
    }


@app.get("/audits/{job_id}/logs/verify")
async def verify_audit_logs(job_id: str):
    """
    Quick chain integrity check (uses verify_chain — returns compact summary).
    For the detailed per-step report, use GET /audits/{job_id}/verify.
    """
    chain = get_audit_chain(job_id)
    result = verify_chain(chain)
    return {
        "job_id": job_id,
        **result,
    }


@app.get("/audits/{job_id}/verify")
async def verify_audit_integrity(job_id: str):
    """
    Full audit chain verification engine.

    Iterates every log entry and runs three checks:
      1. Hash integrity   — recomputes SHA-256, compares with stored value
      2. Chain linkage    — verifies prev_hash matches the preceding entry
      3. Signature check  — validates Ed25519 signature against server public key

    Returns a structured report:
      {
        "is_valid":      bool,         // overall pass/fail
        "broken_at":     int | null,   // index of first failure
        "total_entries": int,
        "checks_passed": int,
        "checks_failed": int,
        "steps":         [...],        // per-entry check detail
        "failure":       {...} | null, // detail of first broken entry
        "summary":       str
      }
    """
    try:
        report = run_verification_engine(job_id)
    except Exception as e:
        logger.error("Verification engine failed for job_id=%s: %s", job_id, e)
        report = {
            "is_valid": False,
            "broken_at": None,
            "total_entries": 0,
            "checks_passed": 0,
            "checks_failed": 0,
            "steps": [],
            "failure": {"reason": str(e)},
            "summary": f"Verification engine error: {e}",
        }
    return {
        "job_id": job_id,
        **report,
    }


@app.get("/audit-logs/public-key")
async def get_signing_public_key():
    """
    Return the server's Ed25519 public key.

    Third parties can use this key to independently verify that every
    audit log entry was produced by this FairLens Studio server instance
    and has not been tampered with since it was signed.

    Returns both:
      - pem  : PEM-encoded key (for use with openssl / Python cryptography)
      - hex  : Raw 32-byte public key as a 64-char hex string
      - algorithm : "Ed25519"
    """
    try:
        return {
            "algorithm": "Ed25519",
            "public_key_pem": get_public_key_pem(),
            "public_key_hex": get_public_key_hex(),
            "usage": "Verify the 'signature' field in each audit log entry using this key.",
        }
    except Exception as e:
        logger.error("Failed to retrieve signing public key: %s", e)
        raise HTTPException(status_code=500, detail="Signing key unavailable")


@app.get("/audits/{job_id}/proof")
async def export_audit_proof(job_id: str):
    """
    Generate a complete, verifiable audit proof bundle.

    Packages together:
      - All audit log entries (hashes + signatures)
      - Full verification report (per-step check results)
      - Server public key (for independent verification)
      - Signed proof certificate

    This bundle can be downloaded as JSON and shared with auditors,
    regulators, or compliance teams to prove the audit chain's integrity
    without access to the FairLens server.
    """
    from datetime import datetime, timezone as tz

    # 1. Fetch full chain
    chain = get_audit_chain(job_id)

    # 2. Run full verification
    try:
        verification = run_verification_engine(job_id)
    except Exception as e:
        verification = {
            "is_valid": False,
            "broken_at": None,
            "total_entries": 0,
            "checks_passed": 0,
            "checks_failed": 0,
            "steps": [],
            "failure": {"reason": str(e)},
            "summary": f"Verification failed: {e}",
        }

    # 3. Fetch public key
    try:
        pub_key_pem = get_public_key_pem()
        pub_key_hex = get_public_key_hex()
    except Exception:
        pub_key_pem = "unavailable"
        pub_key_hex = "unavailable"

    # 4. Build proof certificate
    now = datetime.now(tz.utc).isoformat()
    is_valid = verification.get("is_valid", False)

    # Sign the certificate payload for tamper evidence
    import hashlib
    cert_payload = f"{job_id}|{now}|{is_valid}|{len(chain)}"
    cert_hash = hashlib.sha256(cert_payload.encode()).hexdigest()
    try:
        from signing import sign_hash
        cert_signature = sign_hash(cert_hash)
    except Exception:
        cert_signature = "unavailable"

    proof = {
        "proof_type": "FairLens Audit Integrity Proof",
        "schema_version": "1.0",
        "generated_at": now,
        "job_id": job_id,
        "integrity_proof": {
            "status": "VERIFIED" if is_valid else "TAMPERED",
            "label": "Integrity Proof: Verified" if is_valid else "Integrity Proof: FAILED",
            "is_valid": is_valid,
            "broken_at": verification.get("broken_at"),
            "total_entries": verification.get("total_entries", len(chain)),
            "checks_passed": verification.get("checks_passed", 0),
            "checks_failed": verification.get("checks_failed", 0),
            "summary": verification.get("summary", ""),
        },
        "certificate": {
            "issued_at": now,
            "issuer": "FairLens Studio Governance Engine",
            "subject": f"Audit Job {job_id}",
            "hash": cert_hash,
            "signature": cert_signature,
            "algorithm": "Ed25519 + SHA-256",
        },
        "public_key": {
            "algorithm": "Ed25519",
            "pem": pub_key_pem,
            "hex": pub_key_hex,
            "usage": "Use this key to independently verify each log entry signature.",
        },
        "audit_chain": [
            {
                "index": i,
                "log_id": entry.get("log_id", ""),
                "action": entry.get("action", ""),
                "timestamp": entry.get("timestamp", ""),
                "metadata": entry.get("metadata", {}),
                "prev_hash": entry.get("prev_hash", ""),
                "hash": entry.get("hash", ""),
                "signature": entry.get("signature", ""),
            }
            for i, entry in enumerate(chain)
        ],
        "verification_steps": verification.get("steps", []),
    }

    return proof


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
        "correlation_matrix": correlations,
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
