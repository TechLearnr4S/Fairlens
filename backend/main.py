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

# In-memory storage for MVP (In production, load from Cloud Storage/Firestore)
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
    """
    Receives a CSV file and returns the columns to the frontend.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    contents = await file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
        columns = df.columns.tolist()
        
        job_id = str(uuid.uuid4())
        LOCAL_DATASTORE[job_id] = df
        
        return {
            "job_id": job_id,
            "filename": file.filename,
            "columns": columns,
            "row_count": len(df)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {str(e)}")

class AuditRunRequest(BaseModel):
    job_id: str
    target_column: str
    protected_attributes: list[str]

@app.post("/audits/run")
async def run_audit(payload: AuditRunRequest):
    if payload.job_id not in LOCAL_DATASTORE:
        raise HTTPException(status_code=404, detail="Dataset not found or session expired. Please re-upload.")
        
    df = LOCAL_DATASTORE[payload.job_id]
    
    # Run core fairness analysis
    try:
        disparities = compute_disparities(df, payload.target_column, payload.protected_attributes)
        proxies = identify_proxies(df, payload.protected_attributes, top_n=3)
        explanation = generate_fairness_explanation(disparities, proxies)
        
        return {
            "status": "success",
            "job_id": payload.job_id,
            "disparities": disparities,
            "proxies": proxies,
            "explanation": explanation
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

class PassportRequest(BaseModel):
    job_id: str
    filename: str
    target_column: str
    protected_attributes: list[str]
    disparities: dict
    proxies: list
    explanation: str | None = None

@app.post("/audits/passport")
async def generate_passport(payload: PassportRequest):
    try:
        receipt = generate_audit_receipt(
            payload.job_id, payload.filename, payload.target_column, 
            payload.protected_attributes, payload.disparities, payload.proxies
        )
        
        markdown = generate_fairness_passport(
            payload.job_id, payload.filename, payload.target_column, 
            payload.protected_attributes, payload.disparities, payload.proxies, 
            payload.explanation, receipt["signature_hash"]
        )
        
        return {
            "receipt": receipt,
            "markdown": markdown
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

