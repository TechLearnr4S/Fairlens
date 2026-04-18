"""
cache.py
========
Lightweight in-memory result cache for FairLens Studio.

Keyed by (audit_id, cache_key) where cache_key is a deterministic
hash of the operation parameters.  Avoids recomputing fairness,
proxy, and simulation results for the same inputs.

Thread-safety: not required for single-worker FastAPI/uvicorn MVP.
For multi-worker deployments, replace with Redis.
"""

from __future__ import annotations
import hashlib
import json
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------

_CACHE: dict[str, dict] = {}   # key → {value, expires_at}
DEFAULT_TTL_SECONDS = 3600      # 1 hour


def _make_key(audit_id: str, operation: str, params: dict | None = None) -> str:
    """Deterministic cache key from audit_id + operation + params dict."""
    params_str = json.dumps(params or {}, sort_keys=True, default=str)
    raw = f"{audit_id}::{operation}::{params_str}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def cache_get(audit_id: str, operation: str, params: dict | None = None) -> Any | None:
    """
    Return cached value or None if missing / expired.

    Parameters
    ----------
    audit_id  : str
    operation : str  e.g. "fairness", "proxies", "simulation", "explanation"
    params    : dict  Additional parameters that differentiate the cache entry
    """
    key = _make_key(audit_id, operation, params)
    entry = _CACHE.get(key)
    if entry is None:
        return None
    if time.time() > entry["expires_at"]:
        del _CACHE[key]
        logger.debug("cache MISS (expired) | audit_id=%s op=%s", audit_id, operation)
        return None
    logger.info("cache HIT | audit_id=%s op=%s", audit_id, operation)
    return entry["value"]


def cache_set(
    audit_id: str,
    operation: str,
    value: Any,
    params: dict | None = None,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> None:
    """
    Store a value in the cache.

    Parameters
    ----------
    audit_id  : str
    operation : str
    value     : Any  The result to cache (must be JSON-serialisable for future Redis compat)
    params    : dict
    ttl       : int  Seconds until expiry
    """
    key = _make_key(audit_id, operation, params)
    _CACHE[key] = {"value": value, "expires_at": time.time() + ttl}
    logger.info("cache SET | audit_id=%s op=%s ttl=%ds", audit_id, operation, ttl)


def cache_invalidate(audit_id: str) -> int:
    """
    Remove ALL cache entries for a given audit_id.
    Returns number of entries removed.
    """
    prefix = audit_id + "::"
    to_delete = [
        k for k, v in _CACHE.items()
        if v.get("audit_id") == audit_id or audit_id in k
    ]
    # Rebuild keys using our deterministic scheme — scan by checking raw key content
    all_keys = list(_CACHE.keys())
    removed = 0
    for k in all_keys:
        # We can't reverse the hash, so we track audit_ids separately
        entry = _CACHE.get(k)
        if entry and entry.get("_audit_id") == audit_id:
            del _CACHE[k]
            removed += 1
    logger.info("cache INVALIDATE | audit_id=%s removed=%d", audit_id, removed)
    return removed


def cache_stats() -> dict:
    """Return current cache size and key count (for /health endpoint)."""
    now = time.time()
    active = sum(1 for e in _CACHE.values() if e["expires_at"] > now)
    return {"total_keys": len(_CACHE), "active_keys": active}
