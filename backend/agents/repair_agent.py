import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

class RepairAgent:
    """
    Suggests technical bias mitigation strategies using a 100% deterministic
    rule-based approach. No LLM dependency.
    """

    def __init__(self, fairness_data: Dict[str, Any], proxy_results: List[Dict[str, Any]]):
        self.fairness_data = fairness_data
        self.proxy_results = proxy_results

    def generate_recommendations(self) -> Dict[str, Any]:
        """
        Generates structured mitigation suggestions and trade-off analysis.
        """
        recommendations = []
        mitigation_types = set()
        
        # 1. Threshold Adjustments
        for attr, metrics in self.fairness_data.items():
            if metrics.get("disparity_score", 0) > 0.1:
                recommendations.append(
                    f"Adjust decision threshold for '{attr}' to equalize selection rates."
                )
                mitigation_types.add("post-processing")

        # 2. Feature Removal (Proxies)
        high_risk_proxies = [p for p in self.proxy_results if p.get("risk_level") == "High"]
        for p in high_risk_proxies:
            recommendations.append(
                f"Remove high-risk proxy feature: {p['feature']}"
            )
            mitigation_types.add("pre-processing")

        # 3. General Reweighting
        if any(m.get("disparity_score", 0) > 0.15 for m in self.fairness_data.values()):
            recommendations.append(
                "Apply sample reweighting to balance subgroup representation."
            )
            mitigation_types.add("pre-processing")

        # 4. Deterministic Trade-off Logic
        tradeoffs = self._get_deterministic_tradeoff(mitigation_types)

        return {
            "recommendations": recommendations[:5],
            "tradeoffs": tradeoffs
        }

    def _get_deterministic_tradeoff(self, mitigation_types: set) -> str:
        """
        Provides a static, professional trade-off summary based on mitigation strategies.
        """
        if not mitigation_types:
            return "No significant trade-offs identified for the current audit state."
        
        if "pre-processing" in mitigation_types and "post-processing" in mitigation_types:
            return "Hybrid mitigation may reduce accuracy slightly but significantly improves demographic parity and legal compliance."
        elif "pre-processing" in mitigation_types:
            return "Feature removal and reweighting may lead to a minor loss in model precision as proxy information is removed."
        else:
            return "Threshold adjustments can impact overall recall but effectively minimize disparate impact at the decision point."

def run_repair_audit(fairness_data: Dict[str, Any], proxy_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Helper to execute the Repair Agent.
    """
    agent = RepairAgent(fairness_data, proxy_results)
    return agent.generate_recommendations()
