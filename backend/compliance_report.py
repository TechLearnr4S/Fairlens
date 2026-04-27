import json
import datetime
from typing import Dict, Any
from logger_db import get_audit_trail, verify_audit

def generate_compliance_report(job_id: str, datastore: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synthesizes the raw cryptographic ledger into a structured compliance report.
    """
    logs = get_audit_trail(job_id)
    verification = verify_audit(job_id)
    
    report = {
        "report_id": f"CR-{job_id[:8].upper()}-{datetime.datetime.utcnow().strftime('%Y%m%d')}",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "audit_integrity_status": {
            "is_valid": verification["is_valid"],
            "verification_summary": verification["reason"],
            "cryptographic_proof": "Included via attached signature and hash chain references",
            "total_logs": len(logs)
        },
        "model_overview": {},
        "fairness_results": {},
        "risks_identified": [],
        "mitigation_steps": [],
        "final_decision": {
            "status": "PENDING",
            "ethical_score": None
        },
        "actor_logs": []
    }
    
    for log in logs:
        action = log["action"]
        meta = json.loads(log["metadata"])
        actor = json.loads(log["actor"])
        timestamp = log["timestamp"]
        
        # 1. Actor Tracking (for accountability)
        report["actor_logs"].append({
            "action": action,
            "actor_id": actor.get("id"),
            "actor_type": actor.get("type"),
            "timestamp": timestamp,
            "hash": log["hash"],
            "signature": log["signature"]
        })
        
        # 2. Extract specific domain knowledge
        if action == "DATASET_UPLOAD":
            report["model_overview"]["dataset_name"] = meta.get("filename")
            report["model_overview"]["dataset_rows"] = meta.get("rows")
            
        elif action in ["FAIRNESS_AUDIT", "FAIRNESS_RUN"]:
            report["model_overview"]["target_variable"] = meta.get("target") or meta.get("target_column")
            report["model_overview"]["protected_attributes"] = meta.get("protected") or meta.get("protected_attributes")
            report["fairness_results"]["initial_disparities"] = meta.get("disparities")
            
            disparities = meta.get("disparities", {})
            if isinstance(disparities, dict):
                for group, val in disparities.items():
                    if isinstance(val, (int, float)) and val > 0.1:
                        report["risks_identified"].append({
                            "type": "HIGH_BIAS",
                            "description": f"Significant disparity ({val:.1%}) detected in subgroup: {group}",
                            "severity": "CRITICAL"
                        })
                    
        elif action in ["SIMULATION_APPLIED", "SIMULATION_RUN"]:
            report["mitigation_steps"].append({
                "method": meta.get("method"),
                "parameters_applied": meta.get("params"),
                "bias_reduction_achieved": f"{meta.get('bias_reduction_pct', 0)}%",
                "accuracy_tradeoff": f"{meta.get('accuracy_change_pct', 0)}%",
                "timestamp": timestamp
            })
            
        elif action == "MODEL_EVALUATION":
            score = meta.get("ethical_score", 0)
            report["final_decision"] = {
                "status": "APPROVED" if score >= 0.8 else "REJECTED_BY_POLICY",
                "ethical_score": score,
                "timestamp": timestamp
            }
            
        elif action == "POLICY_VIOLATION":
            report["risks_identified"].append({
                "type": "GOVERNANCE_VIOLATION",
                "description": meta.get("reason", "Unauthorized action attempted"),
                "severity": "HIGH",
                "timestamp": timestamp
            })

    return report
