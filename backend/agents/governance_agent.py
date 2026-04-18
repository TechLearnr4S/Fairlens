import logging
import json
from typing import Any, Dict
from ..services.gemini_service import generate_completion

logger = logging.getLogger(__name__)

class GovernanceAgent:
    """
    Synthesizes audit findings, explanations, and repair suggestions into
    a formal governance-ready conclusion and deployment recommendation.
    """

    def __init__(self, auditor_findings: Dict[str, Any], explanation: str, repair_plan: Dict[str, Any]):
        self.findings = auditor_findings
        self.explanation = explanation
        self.repair_plan = repair_plan

    def generate_conclusion(self) -> Dict[str, Any]:
        """
        Generates the final audit decision and governance summary.
        """
        # Determine a preliminary decision based on risk level
        risk_level = self.findings.get("risk_level", "Medium")
        
        prelim_decision = "Proceed with caution"
        if risk_level == "High":
            prelim_decision = "Mitigation required before deployment"
        elif risk_level == "Low":
            prelim_decision = "Approve for deployment"

        # Use Gemini to generate a high-quality governance summary
        summary = self._get_ai_governance_summary(prelim_decision)

        return {
            "decision": prelim_decision,
            "summary": summary,
            "metadata": {
                "risk_rating": risk_level,
                "repair_count": len(self.repair_plan.get("recommendations", []))
            }
        }

    def _get_ai_governance_summary(self, decision: str) -> str:
        """
        Synthesizes all audit layers into a formal declaration.
        """
        prompt = f"""
As a Chief AI Ethics Officer, provide a formal governance summary for a model audit with the following status:

1. Auditor Findings: {json.dumps(self.findings.get('key_findings', []), indent=2)}
2. Narrative Context: {self.explanation}
3. Recommended Actions: {json.dumps(self.repair_plan.get('recommendations', []), indent=2)}
4. Initial Deployment Decision: {decision}

Task:
Write a 3-4 sentence formal conclusion that:
- Summarizes the overall risk state.
- Justifies the deployment decision.
- Confirms the path forward (e.g., following the recommended repair actions).

Tone: Formal, corporate, authoritative, and regulatory-aware.
"""
        return generate_completion(prompt, persona="Chief Governance & Ethics Officer")

def run_governance_audit(auditor_findings: Dict[str, Any], explanation: str, repair_plan: Dict[str, Any]) -> Dict[str, Any]:
    """
    Helper to execute the Governance Agent.
    """
    agent = GovernanceAgent(auditor_findings, explanation, repair_plan)
    return agent.generate_conclusion()
