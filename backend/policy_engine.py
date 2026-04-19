import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

class PolicyEngine:
    """
    Enforces governance policies to prevent unsafe or non-compliant actions.
    """

    def __init__(self, datastore: Dict[str, Any], thresholds: Optional[Dict[str, float]] = None):
        self.datastore = datastore
        self.thresholds = thresholds or {
            "min_fairness_score": 0.8,
            "max_disparity": 0.1
        }

    def validate_action(self, job_id: str, action: str) -> Tuple[bool, Optional[str]]:
        """
        Validates if an action is allowed based on the current state of the audit.
        """
        if job_id not in self.datastore:
            return False, "Audit session not found."

        state = self.datastore[job_id]
        results = state.get("results", {})

        if action == "GENERATE_PASSPORT" or action == "APPROVE_MODEL":
            # 1. Must have run evaluation
            if "model_evaluation" not in results:
                return False, "Evaluation step skipped. You must run a full Model Fairness Evaluation before approval."

            # 2. Must meet fairness threshold
            ethical_score = results["model_evaluation"].get("overall", {}).get("ethical_score", 0)
            if ethical_score < self.thresholds["min_fairness_score"]:
                return False, f"Fairness threshold not met (Score: {ethical_score:.2f} < {self.thresholds['min_fairness_score']}). Action blocked."

            # 3. Must have run simulation if bias was detected
            max_disparity = results["model_evaluation"].get("disparities", {}).get("tpr_gap", 0)
            if max_disparity > self.thresholds["max_disparity"] and "simulation" not in results:
                return False, f"High bias detected (Gap: {max_disparity:.1%}). You must run a mitigation simulation before approval."

        if action == "RUN_SIMULATION":
            if "disparities" not in results:
                return False, "Initial fairness audit must be run before starting simulations."

        return True, None

    def enforce(self, job_id: str, action: str):
        allowed, reason = self.validate_action(job_id, action)
        if not allowed:
            # Log the violation
            logger.warning("POLICY_VIOLATION | job_id=%s action=%s reason=%s", job_id, action, reason)
            from logger_db import log_event
            log_event(job_id, "POLICY_VIOLATION", {"attempted_action": action, "reason": reason})
            raise PolicyViolationException(reason)
        return True

class PolicyViolationException(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)
