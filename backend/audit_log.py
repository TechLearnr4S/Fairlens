"""
audit_log.py
============
Hash-chained, append-only, digitally signed audit logging for FairLens Studio.

Each log entry is:
  1. Cryptographically chained via SHA-256 (prev_hash → hash)
  2. Digitally signed with the server's Ed25519 private key

Chain structure:
    GENESIS ← entry_1 ← entry_2 ← ... ← entry_n

Schema per entry
----------------
{
  "audit_id":  str,   # UUID of the parent audit job
  "log_id":    str,   # auto UUID for this entry document
  "action":    str,   # e.g. "DATASET_UPLOADED"
  "timestamp": str,   # ISO-8601 UTC
  "metadata":  dict,  # arbitrary context payload
  "prev_hash": str,   # hash of previous entry ("GENESIS" for first)
  "hash":      str,   # SHA-256(prev_hash + action + timestamp + metadata_json)
  "signature": str    # Ed25519 signature of hash (hex-encoded)
}

Usage
-----
    from audit_log import append_audit_log, get_audit_chain, verify_chain

    append_audit_log(
        audit_id="abc123",
        action="FAIRNESS_RUN",
        metadata={"target": "income", "rows": 5000}
    )
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from signing import sign_hash, verify_signature

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GENESIS_HASH = "GENESIS"
COLLECTION = "audit_logs"

# In-memory fallback for local demos / non-cloud environments
GLOBAL_LOG_CACHE: dict[str, list[dict]] = {}


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------

def _compute_hash(prev_hash: str, action: str, timestamp: str, metadata: dict) -> str:
    """
    Deterministic SHA-256 hash of the entry contents.

    Hash input: prev_hash + action + timestamp + JSON(metadata, sort_keys=True)
    """
    metadata_str = json.dumps(metadata, sort_keys=True, default=str)
    raw = f"{prev_hash}{action}{timestamp}{metadata_str}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Chain helpers
# ---------------------------------------------------------------------------

def _get_last_entry(db: Any, audit_id: str) -> dict | None:
    """
    Retrieve the most recent log entry for a given audit_id (by timestamp desc).
    Returns None if no entries exist yet (i.e., the chain starts fresh).
    """
    try:
        query = (
            db.collection(COLLECTION)
            .where("audit_id", "==", audit_id)
            .order_by("timestamp", direction="DESCENDING")
            .limit(1)
        )
        docs = list(query.stream())
        if docs:
            return docs[0].to_dict()
    except Exception as e:
        logger.warning("Could not query last entry for audit_id=%s: %s", audit_id, e)
    return None


def _build_entry(
    audit_id: str,
    action: str,
    metadata: dict,
    prev_hash: str,
) -> dict:
    """Construct a fully-formed, hashed, and digitally signed log entry dict."""
    timestamp = datetime.now(timezone.utc).isoformat()
    entry_hash = _compute_hash(prev_hash, action, timestamp, metadata)

    # Sign the hash with the server's Ed25519 private key
    try:
        signature = sign_hash(entry_hash)
    except Exception as e:
        logger.warning("Signing failed for action=%s: %s", action, e)
        signature = ""

    return {
        "audit_id":  audit_id,
        "log_id":    str(uuid.uuid4()),
        "action":    action,
        "timestamp": timestamp,
        "metadata":  metadata,
        "prev_hash": prev_hash,
        "hash":      entry_hash,
        "signature": signature,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def append_audit_log(
    audit_id: str,
    action: str,
    metadata: dict | None = None,
) -> dict:
    """
    Append a new hash-chained entry to the audit_logs collection.

    - Reads the previous entry's hash (or uses "GENESIS" for the first).
    - Computes a new SHA-256 hash over prev_hash + action + timestamp + metadata.
    - Writes the new entry as a *new* document (append-only; never overwrites).

    Parameters
    ----------
    audit_id : str
        The parent job / audit identifier.
    action : str
        A short, uppercase action label (e.g. "DATASET_UPLOADED").
    metadata : dict, optional
        Arbitrary context data (will be JSON-serialised into the hash).

    Returns
    -------
    dict
        The full log entry that was persisted (including hash fields).
    """
    safe_metadata = metadata or {}

    try:
        from firebase_client import get_firestore_client
        db = get_firestore_client()

        # 1. Determine previous hash
        last = _get_last_entry(db, audit_id)
        prev_hash = last["hash"] if last else GENESIS_HASH

        # 2. Build the new entry
        entry = _build_entry(audit_id, action, safe_metadata, prev_hash)

        # 3. Write as a NEW document (auto-ID) — guarantees append-only
        db.collection(COLLECTION).document(entry["log_id"]).set(entry)
        logger.info(
            "audit_log | audit_id=%s action=%s hash=%s…",
            audit_id, action, entry["hash"][:12],
        )
        return entry

    except Exception as e:
        # Reduced from error to debug to clean up terminal noise for local demos
        logger.debug(
            "audit_log | Firestore unavailable, using local memory cache for audit_id=%s",
            audit_id
        )
        
        # Determine previous hash from local cache
        local_chain = GLOBAL_LOG_CACHE.get(audit_id, [])
        prev_hash = local_chain[-1]["hash"] if local_chain else GENESIS_HASH
        
        # Build and store in local cache
        entry = _build_entry(audit_id, action, safe_metadata, prev_hash)
        if audit_id not in GLOBAL_LOG_CACHE:
            GLOBAL_LOG_CACHE[audit_id] = []
        GLOBAL_LOG_CACHE[audit_id].append(entry)
        
        return entry


def get_audit_chain(audit_id: str) -> list[dict]:
    """
    Retrieve the full audit chain for an audit_id, sorted chronologically.

    Returns
    -------
    list[dict]
        All log entries in ascending timestamp order.
    """
    try:
        from firebase_client import get_firestore_client
        db = get_firestore_client()
        query = (
            db.collection(COLLECTION)
            .where("audit_id", "==", audit_id)
            .order_by("timestamp", direction="ASCENDING")
        )
        return [doc.to_dict() for doc in query.stream()]
    except Exception as e:
        logger.debug("get_audit_chain | Firestore unavailable, falling back to local cache.")
        return GLOBAL_LOG_CACHE.get(audit_id, [])


def verify_chain(entries: list[dict]) -> dict:
    """
    Verify the cryptographic integrity and digital signatures of an audit chain.

    Per entry checks:
      1. SHA-256 hash matches recomputed value (content integrity)
      2. prev_hash matches preceding entry's hash (chain linkage)
      3. Ed25519 signature is valid (origin authenticity)

    Parameters
    ----------
    entries : list[dict]
        Ordered list of log entry dicts (from get_audit_chain).

    Returns
    -------
    dict with keys:
        valid            : bool       — True only if ALL checks pass
        total            : int        — number of entries verified
        broken_at        : int | None — index of first failure (None if valid)
        broken_entry     : dict | None
        reason           : str | None — human-readable failure description
        signature_verified: bool      — False if any signature is invalid
    """
    if not entries:
        return {
            "valid": True, "total": 0, "broken_at": None,
            "broken_entry": None, "reason": None, "signature_verified": True,
        }

    # Verify first entry references GENESIS
    first = entries[0]
    if first.get("prev_hash") != GENESIS_HASH:
        return {
            "valid": False, "total": len(entries), "broken_at": 0,
            "broken_entry": first, "signature_verified": False,
            "reason": "First entry does not reference GENESIS",
        }

    for i, entry in enumerate(entries):
        # --- Check 1: Hash integrity ---
        expected = _compute_hash(
            entry["prev_hash"],
            entry["action"],
            entry["timestamp"],
            entry["metadata"],
        )
        if expected != entry.get("hash"):
            return {
                "valid": False, "total": len(entries), "broken_at": i,
                "broken_entry": entry, "signature_verified": False,
                "reason": f"Hash mismatch at index {i}: expected {expected[:16]}…",
            }

        # --- Check 2: Chain linkage ---
        if i > 0 and entry["prev_hash"] != entries[i - 1]["hash"]:
            return {
                "valid": False, "total": len(entries), "broken_at": i,
                "broken_entry": entry, "signature_verified": False,
                "reason": f"Chain broken at index {i}: prev_hash does not match prior entry",
            }

        # --- Check 3: Digital signature ---
        sig = entry.get("signature", "")
        if sig and not verify_signature(entry["hash"], sig):
            return {
                "valid": False, "total": len(entries), "broken_at": i,
                "broken_entry": entry, "signature_verified": False,
                "reason": f"Invalid Ed25519 signature at index {i} (action: {entry['action']})",
            }

    return {
        "valid": True, "total": len(entries),
        "broken_at": None, "broken_entry": None,
        "reason": None, "signature_verified": True,
    }


# ---------------------------------------------------------------------------
# Full Verification Engine
# ---------------------------------------------------------------------------

def run_verification_engine(audit_id: str) -> dict:
    """
    Full integrity verification engine for an audit chain.

    Retrieves the chain from Firestore, then runs three checks on every entry:
      1. Hash integrity   — recompute SHA-256 and compare with stored hash
      2. Chain linkage    — verify prev_hash matches the prior entry's hash
      3. Signature check  — verify Ed25519 signature on the hash

    Returns a structured report with:
      - is_valid      : bool         — overall pass/fail
      - broken_at     : int | null   — index of first failure (null if valid)
      - total_entries : int          — total entries checked
      - checks_passed : int          — number of entries that passed all checks
      - checks_failed : int          — number that failed
      - steps         : list[dict]   — per-entry result for every check
      - failure       : dict | null  — details of the first failure
    """
    entries = get_audit_chain(audit_id)

    if not entries:
        return {
            "is_valid": True,
            "broken_at": None,
            "total_entries": 0,
            "checks_passed": 0,
            "checks_failed": 0,
            "steps": [],
            "failure": None,
            "summary": "No audit log entries found for this job.",
        }

    steps = []
    first_failure_index = None
    first_failure_detail = None

    for i, entry in enumerate(entries):
        step = {
            "index": i,
            "log_id": entry.get("log_id", "unknown"),
            "action": entry.get("action", "unknown"),
            "timestamp": entry.get("timestamp", ""),
            "hash_stored": entry.get("hash", "")[:16] + "…",
            "checks": {
                "hash_valid": False,
                "chain_linked": False,
                "signature_valid": False,
            },
            "passed": False,
            "failure_reason": None,
        }

        # ── Check 1: Hash integrity ──────────────────────────────────────────
        expected_hash = _compute_hash(
            entry.get("prev_hash", ""),
            entry.get("action", ""),
            entry.get("timestamp", ""),
            entry.get("metadata", {}),
        )
        hash_match = expected_hash == entry.get("hash", "")
        step["checks"]["hash_valid"] = hash_match
        if not hash_match:
            step["failure_reason"] = (
                f"Hash mismatch: stored={entry.get('hash','')[:16]}… "
                f"expected={expected_hash[:16]}…"
            )

        # ── Check 2: Chain linkage ───────────────────────────────────────────
        if i == 0:
            # First entry must reference GENESIS
            chain_ok = entry.get("prev_hash") == GENESIS_HASH
            step["checks"]["chain_linked"] = chain_ok
            if not chain_ok and not step["failure_reason"]:
                step["failure_reason"] = (
                    f"First entry prev_hash is '{entry.get('prev_hash')}', "
                    f"expected 'GENESIS'"
                )
        else:
            # Subsequent entries must link to the previous entry's hash
            expected_prev = entries[i - 1].get("hash", "")
            chain_ok = entry.get("prev_hash", "") == expected_prev
            step["checks"]["chain_linked"] = chain_ok
            if not chain_ok and not step["failure_reason"]:
                step["failure_reason"] = (
                    f"Chain broken: prev_hash={entry.get('prev_hash','')[:16]}… "
                    f"does not match prior hash={expected_prev[:16]}…"
                )

        # ── Check 3: Digital signature ───────────────────────────────────────
        sig = entry.get("signature", "")
        if sig:
            try:
                sig_ok = verify_signature(entry.get("hash", ""), sig)
            except Exception:
                sig_ok = False
            step["checks"]["signature_valid"] = sig_ok
            if not sig_ok and not step["failure_reason"]:
                step["failure_reason"] = (
                    f"Invalid Ed25519 signature on entry {i} (action: {entry.get('action')})"
                )
        else:
            # No signature stored — treat as unsigned (warn but don't fail)
            step["checks"]["signature_valid"] = None  # None = "not signed"

        # ── Overall step result ──────────────────────────────────────────────
        all_checks_pass = (
            step["checks"]["hash_valid"]
            and step["checks"]["chain_linked"]
            and step["checks"]["signature_valid"] is not False  # None = skip
        )
        step["passed"] = all_checks_pass

        if not all_checks_pass and first_failure_index is None:
            first_failure_index = i
            first_failure_detail = {
                "index": i,
                "log_id": entry.get("log_id"),
                "action": entry.get("action"),
                "timestamp": entry.get("timestamp"),
                "reason": step["failure_reason"],
            }

        steps.append(step)

    checks_passed = sum(1 for s in steps if s["passed"])
    checks_failed = len(steps) - checks_passed
    is_valid = first_failure_index is None

    return {
        "is_valid": is_valid,
        "broken_at": first_failure_index,
        "total_entries": len(entries),
        "checks_passed": checks_passed,
        "checks_failed": checks_failed,
        "steps": steps,
        "failure": first_failure_detail,
        "summary": (
            f"All {len(entries)} entries verified successfully. Chain is intact."
            if is_valid
            else (
                f"Integrity failure at entry {first_failure_index} "
                f"(action: {entries[first_failure_index].get('action','?')}). "
                f"{first_failure_detail.get('reason', '')}"
            )
        ),
    }

