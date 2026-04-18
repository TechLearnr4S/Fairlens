from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import io
import uuid

from fairness_engine import compute_disparities
from proxy_detector import identify_proxies
from llm_explainer import generate_fairness_explanation
from governance import generate_audit_receipt, generate_fairness_passport
from bias_simulator import simulate_threshold_adjustment

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

