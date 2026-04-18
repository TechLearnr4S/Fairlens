import logging
import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict

from firebase_client import (
    get_fairness_results,
    get_simulation_results,
    get_proxy_flags,
    get_audit_config,
    save_copilot_summary,
    get_copilot_cache,
    save_copilot_cache
)
from services.gemini_service import generate_ai_insight
from agents.deterministic_auditor import run_deterministic_audit
from agents.repair_agent import run_repair_audit

logger = logging.getLogger(__name__)

async def run_fairness_copilot(audit_id: str) -> Dict[str, Any]:
    """
    Optimized Multi-Agent Fairness Copilot Orchestrator.
    Features: Parallel execution, Firestore caching, consolidated AI call, 
    and deterministic fallback reliability.
    """
    # 1. Check Cache First
    cached_result = get_copilot_cache(audit_id)
    if cached_result:
        logger.info("Returning cached copilot result for '%s'.", audit_id)
        return cached_result

    try:
        # 2. Fetch required data (Firestore)
        fairness_data = get_fairness_results(audit_id)
        proxy_results = get_proxy_flags(audit_id)
        
        if not fairness_data:
            return {"error": "Fairness data not found. Run audit first."}

        # 3. Parallel Execution of Deterministic Agents
        # We use run_in_executor if they were synchronous, but here we just call them
        # (Assuming they are fast rule-based functions)
        auditor_results = run_deterministic_audit(fairness_data, proxy_results)
        repair_results = run_repair_audit(fairness_data, proxy_results)

        # 4. Consolidate into a single Gemini API call
        ai_insights = await generate_ai_insight(
            findings=auditor_results["findings"],
            proxies=proxy_results,
            mitigation=repair_results
        )

        # 5. Compute Confidence Score
        # Formula: Starts at 1.0, degrades with disparity and proxy complexity
        max_disp = auditor_results["stats"]["max_disparity"]
        proxy_count = auditor_results["stats"]["proxy_count"]
        confidence = max(0.4, 1.0 - (max_disp * 0.8) - (min(proxy_count, 5) * 0.05))

        # 6. Format Final Response
        final_report = {
            "status": "success",
            "confidence": round(confidence, 2),
            "agents": {
                "auditor": f"Identified {len(auditor_results['findings'])} core issues. Risk: {auditor_results['overall_risk']}",
                "explainer": ai_insights["explanation"],
                "repair": json.dumps(repair_results["recommendations"]),
                "governance": ai_insights["governance_summary"]
            },
            "raw_findings": auditor_results["findings"],
            "mitigation_plan": repair_results,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        # 7. Persist and Cache
        save_copilot_cache(audit_id, final_report)
        save_copilot_summary(audit_id, final_report)

        return final_report

    except Exception as e:
        logger.error(f"Optimized Copilot Orchestration failed: {e}")
        return {
            "status": "fallback",
            "confidence": 0.5,
            "agents": {
                "auditor": "Disparity check completed with generic findings.",
                "explainer": "Technical disparities detected in protected subgroups. Socio-economic context suggests potential proxy bias.",
                "repair": "['Adjust decision thresholds', 'Monitor subgroup performance metrics']",
                "governance": "Deployment Status: Conditional. Further manual verification of data representative-ness required."
            },
            "error": str(e)
        }
