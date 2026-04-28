"""
firebase_client.py
==================
Thin wrapper around the Firebase Admin SDK for FairLens Studio.

Provides helpers to:
* Download datasets from Firebase Storage.
* Read / write audit configs and proxy-detection results in Firestore.

Initialisation
--------------
The SDK is initialised lazily on first use.  It will try, in order:

1.  ``GOOGLE_APPLICATION_CREDENTIALS`` env-var pointing to a service-account
    JSON key file (standard Firebase Admin approach).
2.  Application Default Credentials (ADC) — works out of the box inside
    Cloud Run, GCE, or when ``gcloud auth application-default login`` has
    been run locally.

Set ``FIREBASE_STORAGE_BUCKET`` in ``.env`` if the default bucket derived
from the project ID is not correct.
"""

from __future__ import annotations

import io
import logging
import os
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore, storage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy singleton initialisation
# ---------------------------------------------------------------------------

_DEFAULT_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "fairlens-ac1da.firebasestorage.app")

_app: firebase_admin.App | None = None


def _ensure_initialised() -> None:
    """Initialise the Firebase Admin app exactly once."""
    global _app
    if _app is not None:
        return

    try:
        if cred_path and os.path.isfile(cred_path):
            cred = credentials.Certificate(cred_path)
        else:
            # Fall back to Application Default Credentials
            cred = credentials.ApplicationDefault()

        _app = firebase_admin.initialize_app(cred, {
            "storageBucket": _DEFAULT_BUCKET,
        })
        logger.info("Firebase Admin SDK initialised (bucket=%s).", _DEFAULT_BUCKET)
    except Exception as e:
        # Reduced to debug to clean up terminal for local-only demos
        logger.debug("Firebase Admin SDK could not initialise (%s). Running in limited/local mode.", e)
        _app = None


def get_firestore_client() -> firestore.firestore.Client:
    """Return the Firestore client (initialises the SDK if needed)."""
    _ensure_initialised()
    return firestore.client()


def get_storage_bucket() -> storage.storage.Bucket:
    """Return the default Cloud Storage bucket handle."""
    _ensure_initialised()
    return storage.bucket()


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------


def download_dataset_as_dataframe(blob_path: str) -> pd.DataFrame:
    """
    Download a CSV file from Firebase Storage and return it as a DataFrame.

    Parameters
    ----------
    blob_path : str
        Path inside the bucket, e.g. ``"uploads/abc123/dataset.csv"``.

    Raises
    ------
    FileNotFoundError
        If the blob does not exist in the bucket.
    ValueError
        If the blob cannot be parsed as CSV.
    """
    bucket = get_storage_bucket()
    blob = bucket.blob(blob_path)

    if not blob.exists():
        raise FileNotFoundError(f"Dataset not found in Storage: {blob_path}")

    csv_bytes = blob.download_as_bytes()
    try:
        df = pd.read_csv(io.BytesIO(csv_bytes))
    except Exception as exc:
        raise ValueError(f"Failed to parse CSV from Storage: {exc}") from exc

    logger.info("Downloaded dataset from '%s' — %d rows, %d cols.", blob_path, len(df), len(df.columns))
    return df


# ---------------------------------------------------------------------------
# Firestore helpers — Audit config
# ---------------------------------------------------------------------------


def get_audit_config(audit_id: str) -> dict[str, Any]:
    """
    Fetch the audit configuration document from ``audits/{audit_id}``.

    Expected document structure::

        {
          "dataset_path": "uploads/abc123/dataset.csv",
          "target_column": "loan_approved",
          "protected_attributes": ["gender", "race"],
          ...
        }

    Raises
    ------
    FileNotFoundError
        If the audit document does not exist.
    ValueError
        If required fields are missing.
    """
    db = get_firestore_client()
    doc_ref = db.collection("audits").document(audit_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise FileNotFoundError(f"Audit config not found in Firestore: audits/{audit_id}")

    data = doc.to_dict()

    # Validate required fields
    if not data.get("dataset_path"):
        raise ValueError(f"Audit '{audit_id}' is missing 'dataset_path'.")
    if not data.get("protected_attributes"):
        raise ValueError(f"Audit '{audit_id}' has no protected attributes configured.")

    return data


# ---------------------------------------------------------------------------
# Firestore helpers — Proxy flags
# ---------------------------------------------------------------------------


def save_proxy_flags(
    audit_id: str,
    proxy_risks: list[dict[str, Any]],
) -> list[str]:
    """
    Persist each proxy-risk entry as a document in ``proxy_flags``.

    Each document contains::

        {
          "audit_id":   str,
          "feature":    str,
          "score":      float,
          "risk_level": str,
          "is_proxy":   bool,
          "type":       str,
          "method":     str,
          "max_protected": str,
          "created_at": Timestamp,
        }

    Parameters
    ----------
    audit_id : str
    proxy_risks : list[dict]
        Output of ``compute_proxy_risk()``.

    Returns
    -------
    list[str]
        Firestore document IDs that were created.
    """
    db = get_firestore_client()
    collection = db.collection("proxy_flags")
    now = datetime.now(timezone.utc)
    doc_ids: list[str] = []

    # Use a batched write for efficiency (max 500 ops per batch)
    batch = db.batch()
    count = 0

    for entry in proxy_risks:
        doc_ref = collection.document()  # auto-ID
        batch.set(doc_ref, {
            "audit_id":       audit_id,
            "feature":        entry["feature"],
            "score":          entry["score"],
            "risk_level":     entry["risk_level"],
            "is_proxy":       entry["is_proxy"],
            "type":           entry.get("type", "unknown"),
            "method":         entry.get("method", "unknown"),
            "max_protected":  entry.get("max_protected", ""),
            "created_at":     now,
        })
        doc_ids.append(doc_ref.id)
        count += 1

        # Firestore batches are capped at 500 operations
        if count >= 500:
            batch.commit()
            batch = db.batch()
            count = 0

    if count > 0:
        batch.commit()

    logger.info("Saved %d proxy_flags documents for audit '%s'.", len(doc_ids), audit_id)
    return doc_ids


def get_proxy_flags(audit_id: str) -> list[dict[str, Any]]:
    """
    Retrieve all proxy_flags documents for a given audit, sorted by score
    descending.
    """
    db = get_firestore_client()
    query = (
        db.collection("proxy_flags")
        .where("audit_id", "==", audit_id)
        .order_by("score", direction=firestore.firestore.Query.DESCENDING)
    )
    docs = query.stream()
    return [doc.to_dict() for doc in docs]


def save_proxy_explanation(audit_id: str, explanation: str) -> str:
    """
    Save the AI-generated proxy explanation narrative to the
    ``proxy_explanations`` collection in Firestore.

    Parameters
    ----------
    audit_id : str
    explanation : str
        The narrative text generated by Gemini.

    Returns
    -------
    str
        The Firestore document ID.
    """
    db = get_firestore_client()
    now = datetime.now(timezone.utc)
    
    doc_ref = db.collection("proxy_explanations").document()
    doc_ref.set({
        "audit_id": audit_id,
        "explanation": explanation,
        "created_at": now
    })
    
    logger.info("Saved proxy_explanation for audit '%s'.", audit_id)
    return doc_ref.id


def get_fairness_results(audit_id: str) -> dict[str, Any]:
    """
    Retrieve fairness disparity results from Firestore.
    Assumption: saved under audits/{audit_id} in 'results' field.
    """
    db = get_firestore_client()
    doc = db.collection("audits").document(audit_id).get()
    if not doc.exists:
        return {}
    return doc.to_dict().get("results", {}).get("disparities", {})


def get_simulation_results(audit_id: str) -> dict[str, Any]:
    """
    Retrieve bias simulation results from Firestore.
    Assumption: saved under audits/{audit_id} in 'results' field.
    """
    db = get_firestore_client()
    doc = db.collection("audits").document(audit_id).get()
    if not doc.exists:
        return {}
    return doc.to_dict().get("results", {}).get("simulation", {})


def save_copilot_summary(audit_id: str, summary: dict[str, Any]) -> str:
    """
    Persist the Multi-Agent Orchestrator's unified summary to Firestore.
    """
    db = get_firestore_client()
    now = datetime.now(timezone.utc)
    
    doc_ref = db.collection("copilot_summaries").document(audit_id)
    doc_ref.set({
        "audit_id": audit_id,
        "summary": summary,
        "created_at": now
    })
    
    logger.info("Saved copilot_summary for audit '%s'.", audit_id)
    return doc_ref.id


def get_copilot_cache(audit_id: str) -> dict[str, Any] | None:
    """
    Retrieve cached copilot results from Firestore.
    """
    db = get_firestore_client()
    doc = db.collection("copilot_results").document(audit_id).get()
    if doc.exists:
        return doc.to_dict()
    return None


def save_copilot_cache(audit_id: str, data: dict[str, Any]) -> None:
    """
    Caches the consolidated copilot result in Firestore.
    """
    db = get_firestore_client()
    now = datetime.now(timezone.utc)
    
    db.collection("copilot_results").document(audit_id).set({
        **data,
        "audit_id": audit_id,
        "created_at": now
    })
    logger.info("Cached copilot result for audit '%s'.", audit_id)
