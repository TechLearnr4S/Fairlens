from typing import Any, Dict, List

class DeterministicAuditor:
    """
    Statically audits fairness and proxy results using rule-based logic.
    Provides structured, machine-readable findings for AI consumption.
    """

    def __init__(self, fairness_data: Dict[str, Any], proxy_results: List[Dict[Dict[str, Any], Any]]):
        self.fairness_data = fairness_data
        self.proxy_results = proxy_results

    def audit(self) -> Dict[str, Any]:
        """
        Executes the rule-based audit and returns structured findings.
        """
        findings = []
        max_disparity = 0.0
        high_risk_proxies = 0

        # 1. Analyze Fairness Disparities (Structured findings)
        for attr, metrics in self.fairness_data.items():
            score = metrics.get("disparity_score", 0.0)
            max_disparity = max(max_disparity, score)
            
            if score > 0.05: # Track even minor disparities for the summary
                subgroups = metrics.get("subgroups", [])
                if subgroups:
                    sorted_subs = sorted(subgroups, key=lambda x: x.get("selection_rate", 1.0))
                    worst_sub = sorted_subs[0]
                    
                    findings.append({
                        "metric": "selection_rate",
                        "attribute": attr,
                        "group": worst_sub['subgroup'],
                        "disparity": round(score, 4),
                        "severity": "high" if score > 0.2 else "medium" if score > 0.1 else "low"
                    })

        # 2. Analyze Proxy Risks
        high_risk_entries = [p for p in self.proxy_results if p.get("risk_level") == "High"]
        high_risk_proxies = len(high_risk_entries)
        
        for p in high_risk_entries:
            findings.append({
                "metric": "proxy_correlation",
                "attribute": p.get('max_protected', 'sensitive'),
                "group": p['feature'],
                "disparity": round(p.get('score', 0), 4),
                "severity": "high"
            })

        # 3. Determine Overall Risk Level
        if max_disparity > 0.2 or high_risk_proxies > 1:
            overall_risk = "High"
        elif max_disparity > 0.1 or high_risk_proxies > 0:
            overall_risk = "Medium"
        else:
            overall_risk = "Low"

        return {
            "findings": findings,
            "overall_risk": overall_risk,
            "stats": {
                "max_disparity": round(max_disparity, 4),
                "proxy_count": high_risk_proxies
            }
        }

def run_deterministic_audit(fairness_data: Dict[str, Any], proxy_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Helper function to run the deterministic audit.
    """
    auditor = DeterministicAuditor(fairness_data, proxy_results)
    return auditor.audit()
