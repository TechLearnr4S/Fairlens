import sqlite3
import json
import hashlib
import datetime
import os
from typing import Dict, Any, Optional

DB_PATH = "fairlens_audit.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            context TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            metadata TEXT,
            prev_hash TEXT,
            hash TEXT NOT NULL,
            signature TEXT
        )
    ''')
    conn.commit()
    conn.close()

def get_last_hash(audit_id: str) -> str:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT hash FROM audit_logs WHERE audit_id = ? ORDER BY id DESC LIMIT 1", (audit_id,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else "GENESIS"

from signing import sign_hash, verify_signature as verify_ed25519_signature

def log_event(
    audit_id: str, 
    action: str, 
    metadata: Dict[str, Any], 
    actor: Optional[Dict[str, str]] = None,
    context: Optional[Dict[str, Any]] = None
):
    """
    Logs an event with the Enterprise Ledger schema, including actor and versioned context.
    """
    if not os.path.exists(DB_PATH):
        init_db()
        
    actor = actor or {"type": "system", "id": "fairlens_internal"}
    context = context or {"version": "v1.2", "environment": "production"}
    
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    actor_json = json.dumps(actor, sort_keys=True)
    context_json = json.dumps(context, sort_keys=True)
    metadata_json = json.dumps(metadata, sort_keys=True)
    
    prev_hash = get_last_hash(audit_id)
    
    # Compute SHA256(prev_hash + action + actor + context + timestamp + metadata)
    record_string = f"{prev_hash}{action}{actor_json}{context_json}{timestamp}{metadata_json}"
    current_hash = hashlib.sha256(record_string.encode()).hexdigest()
    
    # Sign the hash using the server's private key
    signature = sign_hash(current_hash)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO audit_logs (audit_id, action, actor, context, timestamp, metadata, prev_hash, hash, signature)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (audit_id, action, actor_json, context_json, timestamp, metadata_json, prev_hash, current_hash, signature))
    conn.commit()
    conn.close()
    
    return current_hash

def get_audit_trail(audit_id: Optional[str] = None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    if audit_id:
        cursor.execute("SELECT * FROM audit_logs WHERE audit_id = ? ORDER BY id ASC", (audit_id,))
    else:
        cursor.execute("SELECT * FROM audit_logs ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def verify_audit(audit_id: str) -> Dict[str, Any]:
    """
    Verifies the cryptographic integrity of an entire audit chain using the Ledger schema.
    """
    logs = get_audit_trail(audit_id)
    if not logs:
        return {"is_valid": True, "broken_at": None, "reason": "No logs found"}
        
    for i, log in enumerate(logs):
        # 1. Recompute hash
        actor_json = log["actor"]
        context_json = log["context"]
        metadata_json = log["metadata"]
        
        # Consistent with log_event computation
        record_string = f"{log['prev_hash']}{log['action']}{actor_json}{context_json}{log['timestamp']}{metadata_json}"
        expected_hash = hashlib.sha256(record_string.encode()).hexdigest()
        
        if expected_hash != log["hash"]:
            return {
                "is_valid": False, 
                "broken_at": i, 
                "reason": f"Hash mismatch at record {i}. Ledger content may have been tampered with."
            }
            
        # 2. Verify signature
        signature = log.get("signature")
        if signature and not verify_ed25519_signature(log["hash"], signature):
            return {
                "is_valid": False,
                "broken_at": i,
                "reason": f"Invalid Ed25519 signature at record {i}. Actor identity could not be verified."
            }
            
        # 3. Check chain linkage
        if i == 0:
            if log["prev_hash"] != "GENESIS":
                return {"is_valid": False, "broken_at": 0, "reason": "Ledger genesis link broken"}
        else:
            if log["prev_hash"] != logs[i-1]["hash"]:
                return {
                    "is_valid": False, 
                    "broken_at": i, 
                    "reason": f"Ledger chain broken at record {i}. Sequence interrupted."
                }
                
    return {"is_valid": True, "broken_at": None, "reason": "Audit Ledger integrity verified"}

def tamper_audit_log(audit_id: str) -> bool:
    """
    Simulates tampering by modifying the metadata of the first log entry for an audit.
    This will break the hash of the entry and the chain linkage of subsequent entries.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Get the first record ID for this audit
    cursor.execute("SELECT id, metadata FROM audit_logs WHERE audit_id = ? ORDER BY id ASC LIMIT 1", (audit_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
        
    record_id, metadata_json = row
    metadata = json.loads(metadata_json)
    # Tamper with metadata
    metadata["TAMPERED"] = True
    metadata["original_intent"] = "MALICIOUS_MODIFICATION"
    new_metadata_json = json.dumps(metadata, sort_keys=True)
    
    cursor.execute("UPDATE audit_logs SET metadata = ? WHERE id = ?", (new_metadata_json, record_id))
    conn.commit()
    conn.close()
    return True

def get_audit_replay(audit_id: str) -> Dict[str, Any]:
    """
    Returns a structured timeline of the audit journey for replay and export.
    """
    logs = get_audit_trail(audit_id)
    verification = verify_audit(audit_id)
    
    timeline = []
    for log in logs:
        timeline.append({
            "action": log["action"],
            "timestamp": log["timestamp"],
            "metadata": json.loads(log["metadata"]),
            "hash": log["hash"],
            "prev_hash": log["prev_hash"],
            "signature": log["signature"]
        })
        
    return {
        "audit_id": audit_id,
        "is_intact": verification["is_valid"],
        "verification_summary": verification["reason"],
        "timeline": timeline,
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

def get_decision_history(audit_id: str) -> List[Dict[str, Any]]:
    """
    Reconstructs the human-readable decision history from the audit ledger.
    Extracts inputs, outputs, and reasoning from the timeline of actions.
    """
    logs = get_audit_trail(audit_id)
    history = []
    
    for log in logs:
        action = log["action"]
        metadata = json.loads(log["metadata"])
        
        step_data = {
            "step": action,
            "timestamp": log["timestamp"],
            "input": {},
            "output": {},
            "reasoning": ""
        }
        
        if action == "DATASET_UPLOAD":
            step_data["input"] = {"filename": metadata.get("filename")}
            step_data["output"] = {
                "rows": metadata.get("rows"), 
                "columns": metadata.get("columns")
            }
            step_data["reasoning"] = "Dataset ingested for fairness audit."
            
        elif action in ["FAIRNESS_AUDIT", "FAIRNESS_RUN"]:
            step_data["input"] = {
                "target_column": metadata.get("target_column") or metadata.get("target"),
                "protected_attributes": metadata.get("protected_attributes") or metadata.get("protected")
            }
            step_data["output"] = {
                "disparities": metadata.get("disparities", {})
            }
            attrs_len = len(step_data['input']['protected_attributes'] or [])
            step_data["reasoning"] = f"Computed disparities across {attrs_len} protected attributes."
            
        elif action in ["SIMULATION_APPLIED", "SIMULATION_RUN"]:
            step_data["input"] = {
                "method": metadata.get("method"),
                "params": metadata.get("params")
            }
            step_data["output"] = {
                "bias_reduction_pct": metadata.get("bias_reduction_pct", 0),
                "accuracy_change_pct": metadata.get("accuracy_change_pct", 0)
            }
            step_data["reasoning"] = f"Applied {metadata.get('method')} mitigation."
            
        elif action == "MODEL_EVALUATION":
            step_data["input"] = {
                "y_true": metadata.get("y_true"),
                "y_pred": metadata.get("y_pred")
            }
            step_data["output"] = {
                "ethical_score": metadata.get("ethical_score")
            }
            step_data["reasoning"] = "Evaluated model performance against ethical thresholds."
            
        elif action == "POLICY_VIOLATION":
            step_data["input"] = {"attempted_action": metadata.get("attempted_action")}
            step_data["output"] = {"allowed": False}
            step_data["reasoning"] = metadata.get("reason")
            
        else:
            step_data["input"] = metadata
            step_data["output"] = {"status": "logged"}
            
        history.append(step_data)
        
    return history

# Initialize on import
init_db()
