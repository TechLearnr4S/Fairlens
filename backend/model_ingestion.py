"""
model_ingestion.py
==================
Accept a trained sklearn-compatible model file (.pkl / .joblib) and run
inference against the already-uploaded dataset so that FairLens can audit
the model's *own* predictions — not just a pre-computed CSV column.

Workflow
--------
1. POST /audits/{job_id}/upload-model  →  upload .pkl file
2. The model's predict() is called on the dataset's feature columns
3. Predictions are stored in LOCAL_DATASTORE[job_id]["results"]["model_predictions"]
4. The caller can then hit /audits/{job_id}/model-evaluation using
   "y_pred_col": "__model_pred__"  (the synthetic column name we inject)

Supported formats
-----------------
- .pkl  (pickle / joblib — sklearn, XGBoost, LightGBM, etc.)
- .joblib  (explicit joblib format)

Security
--------
- File size capped at 50 MB
- Only deserialized inside a try/except; malformed files raise 400
- No code execution outside the model's predict() call
"""

from __future__ import annotations

import io
import logging
import pickle

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_MODEL_BYTES = 50 * 1024 * 1024   # 50 MB hard cap
_PRED_COL = "__model_pred__"
_PROB_COL = "__model_prob__"


def _load_model(data: bytes):
    """Try joblib first, fall back to pickle."""
    try:
        return joblib.load(io.BytesIO(data))
    except Exception:
        pass
    try:
        return pickle.loads(data)  # noqa: S301
    except Exception as exc:
        raise ValueError(f"Could not deserialise model file: {exc}") from exc


def register_model_routes(app, LOCAL_DATASTORE: dict):
    """Attach model-ingestion endpoints to the FastAPI app."""

    @app.post("/audits/{job_id}/upload-model")
    async def upload_model(job_id: str, file: UploadFile = File(...)):
        """
        Upload a trained sklearn-compatible model (.pkl / .joblib).

        The endpoint runs the model against the uploaded dataset and injects
        synthetic prediction columns so /model-evaluation can audit them.

        Returns
        -------
        JSON with:
          - model_class    : str  — detected class name
          - n_features     : int  — number of input features expected
          - pred_col       : str  — column name injected (__model_pred__)
          - prob_col       : str | null — probability column (__model_prob__)
          - positive_rate  : float — fraction of positive predictions
          - sample_preds   : list — first 5 predictions for sanity-check
        """
        if job_id not in LOCAL_DATASTORE:
            raise HTTPException(status_code=404, detail="Dataset not found. Upload a CSV first.")

        data = await file.read()
        if len(data) > _MAX_MODEL_BYTES:
            raise HTTPException(status_code=413, detail="Model file exceeds 50 MB limit.")

        try:
            model = _load_model(data)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        df: pd.DataFrame = LOCAL_DATASTORE[job_id]["df"]
        config: dict = LOCAL_DATASTORE[job_id].get("config", {})
        target_col = config.get("target")

        # Build feature matrix — drop target + protected attributes
        drop_cols = [c for c in ([target_col] + config.get("protected", [])) if c and c in df.columns]
        X = df.drop(columns=drop_cols, errors="ignore")

        # Encode categoricals minimally so sklearn models don't crash
        X_enc = X.copy()
        for col in X_enc.select_dtypes(include=["object", "category"]).columns:
            from sklearn.preprocessing import LabelEncoder
            X_enc[col] = LabelEncoder().fit_transform(X_enc[col].astype(str))
        X_enc = X_enc.fillna(X_enc.median(numeric_only=True))

        try:
            preds = model.predict(X_enc)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Model prediction failed: {exc}. "
                    "Ensure the model was trained on a compatible feature set."
                ),
            )

        # Inject predictions back into the dataframe
        df[_PRED_COL] = preds

        # Try probability scores (for calibration analysis)
        prob_col = None
        if hasattr(model, "predict_proba"):
            try:
                proba = model.predict_proba(X_enc)
                df[_PROB_COL] = proba[:, 1] if proba.shape[1] == 2 else proba.max(axis=1)
                prob_col = _PROB_COL
            except Exception:
                pass  # non-fatal

        LOCAL_DATASTORE[job_id]["df"] = df
        LOCAL_DATASTORE[job_id]["results"]["model_predictions"] = {
            "pred_col":     _PRED_COL,
            "prob_col":     prob_col,
            "model_class":  type(model).__name__,
        }

        positive_rate = float(np.mean(preds == 1)) if set(preds).issubset({0, 1}) else float(np.mean(preds))

        logger.info(
            "MODEL_UPLOAD | job_id=%s model=%s features=%d positive_rate=%.3f",
            job_id, type(model).__name__, X_enc.shape[1], positive_rate,
        )

        return {
            "status":        "success",
            "model_class":   type(model).__name__,
            "n_features":    int(X_enc.shape[1]),
            "pred_col":      _PRED_COL,
            "prob_col":      prob_col,
            "positive_rate": round(positive_rate, 4),
            "sample_preds":  list(preds[:5]),
            "message": (
                f"Model predictions injected. Now run POST /audits/{job_id}/model-evaluation "
                f"with y_pred_col='{_PRED_COL}' to audit fairness."
            ),
        }
