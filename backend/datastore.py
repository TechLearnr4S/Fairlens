"""
datastore.py
============
Firestore-backed datastore for FairLens Studio.

Design
------
* In-memory dict is the fast-path (same as before).
* On write  → data is persisted to Firestore asynchronously (non-blocking).
* On miss   → the entry is reconstructed from Firestore transparently.

The DataFrame (``df``) is serialized as a gzipped, base64-encoded CSV string
inside the Firestore document (field ``df_csv_b64``). This keeps the document
self-contained without needing Cloud Storage.

Firestore document structure (collection ``audits``):
  {
    "job_id":           str,
    "filename":         str,
    "row_count":        int,
    "upload_time":      str (ISO-8601),
    "df_csv_b64":       str (gzip+base64 of CSV bytes — set on upload),
    "config":           dict,
    "results":          dict (JSON-serialisable subset),
    "analysis_time":    str,
    "simulation_time":  str,
  }

Limitations
-----------
* Firestore documents are capped at 1 MiB. Very large datasets (>50 k rows ×
  50 cols) may exceed this limit. In that case the ``df_csv_b64`` write is
  skipped and the session remains memory-only for that run.
* The ``results`` dict is also stored but only the JSON-serialisable subset
  (numpy types are converted to Python scalars via a recursive sanitiser).
"""

from __future__ import annotations

import base64
import gzip
import io
import logging
import threading
from datetime import datetime, timezone
from typing import Any, MutableMapping

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ── Helpers ────────────────────────────────────────────────────────────────────

_FIRESTORE_AVAILABLE = False
_db = None


def _get_db():
    """Lazy-initialise Firestore client. Returns None if unavailable."""
    global _FIRESTORE_AVAILABLE, _db
    if _db is not None:
        return _db
    try:
        from firebase_client import get_firestore_client
        _db = get_firestore_client()
        _FIRESTORE_AVAILABLE = True
        logger.info("DATASTORE | Firestore client acquired.")
    except Exception as exc:
        # Reduced from warning to debug to clean up terminal for local-only demos
        logger.debug("DATASTORE | Firestore unavailable (%s). Running memory-only.", exc)
        _db = None
    return _db


def _df_to_b64(df: pd.DataFrame) -> str | None:
    """Serialise DataFrame → gzipped CSV → base64 string. Returns None on error."""
    try:
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
            gz.write(df.to_csv(index=False).encode("utf-8"))
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as exc:
        logger.warning("DATASTORE | df_to_b64 failed: %s", exc)
        return None


def _b64_to_df(b64: str) -> pd.DataFrame | None:
    """Deserialise base64 gzipped CSV → DataFrame. Returns None on error."""
    try:
        raw = base64.b64decode(b64.encode("ascii"))
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
            return pd.read_csv(gz)
    except Exception as exc:
        logger.warning("DATASTORE | b64_to_df failed: %s", exc)
        return None


def _sanitise(obj: Any) -> Any:
    """Recursively convert numpy scalars / arrays to JSON-safe Python types."""
    if isinstance(obj, dict):
        return {k: _sanitise(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitise(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return _sanitise(obj.tolist())
    return obj


def _write_to_firestore(job_id: str, entry: dict) -> None:
    """
    Background thread: write a sanitised snapshot of the in-memory entry to
    Firestore. DataFrames are serialised; numpy types are converted.
    Silently no-ops if Firestore is unavailable or the document would exceed
    the 1 MiB limit.
    """
    db = _get_db()
    if db is None:
        return
    try:
        doc: dict[str, Any] = {
            "job_id":        job_id,
            "filename":      entry.get("filename", "unknown"),
            "row_count":     entry.get("row_count", 0),
            "upload_time":   entry.get("upload_time", ""),
            "analysis_time": entry.get("analysis_time", ""),
            "simulation_time": entry.get("simulation_time", ""),
            "config":        _sanitise(entry.get("config", {})),
            "results":       _sanitise(entry.get("results", {})),
            "updated_at":    datetime.now(timezone.utc).isoformat(),
        }
        # Attach CSV only if it will fit (rough check: <800 KB base64)
        df = entry.get("df")
        if df is not None:
            b64 = _df_to_b64(df)
            if b64 and len(b64) < 800_000:
                doc["df_csv_b64"] = b64
            else:
                logger.info(
                    "DATASTORE | job_id=%s CSV too large for Firestore (%d bytes); "
                    "session is memory-only.",
                    job_id, len(b64) if b64 else -1,
                )
        db.collection("audits").document(job_id).set(doc, merge=True)
        logger.info("DATASTORE | Persisted job_id=%s to Firestore.", job_id)
    except Exception as exc:
        logger.warning("DATASTORE | Firestore write failed for job_id=%s: %s", job_id, exc)


def _load_from_firestore(job_id: str) -> dict | None:
    """
    Attempt to reconstruct a LOCAL_DATASTORE entry from Firestore.
    Returns None if the document does not exist or cannot be restored.
    """
    db = _get_db()
    if db is None:
        return None
    try:
        doc = db.collection("audits").document(job_id).get()
        if not doc.exists:
            logger.info("DATASTORE | job_id=%s not found in Firestore.", job_id)
            return None
        data = doc.to_dict()
        entry: dict[str, Any] = {
            "filename":       data.get("filename", "unknown"),
            "row_count":      data.get("row_count", 0),
            "upload_time":    data.get("upload_time", ""),
            "analysis_time":  data.get("analysis_time", ""),
            "simulation_time": data.get("simulation_time", ""),
            "config":         data.get("config", {}),
            "results":        data.get("results", {}),
            "df":             None,
        }
        b64 = data.get("df_csv_b64")
        if b64:
            df = _b64_to_df(b64)
            if df is not None:
                entry["df"] = df
                logger.info(
                    "DATASTORE | Restored job_id=%s from Firestore (%d rows).",
                    job_id, len(df),
                )
            else:
                logger.warning(
                    "DATASTORE | job_id=%s CSV deserialisation failed.", job_id
                )
        else:
            logger.info(
                "DATASTORE | job_id=%s has no CSV in Firestore (large dataset session).",
                job_id,
            )
        return entry
    except Exception as exc:
        logger.warning("DATASTORE | Firestore load failed for job_id=%s: %s", job_id, exc)
        return None


# ── FirestoreBackedDict ────────────────────────────────────────────────────────

class FirestoreBackedDict(MutableMapping):
    """
    Drop-in replacement for ``LOCAL_DATASTORE = {}``.

    * ``__getitem__`` transparently restores entries from Firestore on cache miss.
    * ``__setitem__`` stores in memory and triggers a background Firestore write.
    * All other MutableMapping operations delegate to the internal dict.
    """

    def __init__(self) -> None:
        self._store: dict[str, dict] = {}

    # ── MutableMapping interface ───────────────────────────────────────────

    def __getitem__(self, job_id: str) -> dict:
        if job_id not in self._store:
            logger.info("DATASTORE | Cache miss for job_id=%s — querying Firestore.", job_id)
            restored = _load_from_firestore(job_id)
            if restored is None:
                raise KeyError(job_id)
            self._store[job_id] = restored
        return self._store[job_id]

    def __setitem__(self, job_id: str, entry: dict) -> None:
        self._store[job_id] = entry
        # Non-blocking background persist
        threading.Thread(
            target=_write_to_firestore,
            args=(job_id, entry),
            daemon=True,
        ).start()

    def __delitem__(self, job_id: str) -> None:
        del self._store[job_id]

    def __iter__(self):
        return iter(self._store)

    def __len__(self) -> int:
        return len(self._store)

    def __contains__(self, job_id: object) -> bool:  # type: ignore[override]
        if job_id in self._store:
            return True
        # Check Firestore without loading the full document (cheaper)
        db = _get_db()
        if db is None:
            return False
        try:
            doc = db.collection("audits").document(str(job_id)).get(
                field_paths=["job_id"]  # Only fetch one field — minimises egress
            )
            return doc.exists
        except Exception:
            return False

    # ── Convenience: propagate sub-dict mutations to Firestore ────────────

    def sync(self, job_id: str) -> None:
        """
        Explicitly trigger a Firestore sync for ``job_id``.
        Call this after in-place mutations (e.g. ``store[job_id]["results"]["x"] = y``).
        """
        if job_id in self._store:
            threading.Thread(
                target=_write_to_firestore,
                args=(job_id, self._store[job_id]),
                daemon=True,
            ).start()
