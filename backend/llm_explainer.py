"""
llm_explainer.py
================
Gemini-powered fairness explanation generator for FairLens Studio.

One Gemini call per audit — results are cached in LOCAL_DATASTORE.
Inputs are truncated to prevent token overflow and control cost.
Falls back to a deterministic mock on any LLM failure.
"""

from __future__ import annotations
import json
import logging

from config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

# Re-export generate_proxy_explanation for backward-compat imports
try:
    from services.gemini_service import generate_proxy_explanation  # noqa: F401
except Exception:
    def generate_proxy_explanation(*args, **kwargs) -> str:  # type: ignore
        return "Proxy explanation unavailable."

# ---------------------------------------------------------------------------
# Input truncation helpers
# ---------------------------------------------------------------------------

def _truncate_disparities(disparities: dict, max_attrs: int = 10) -> dict:
    """Keep only the top-N highest-disparity attributes to limit token usage."""
    sorted_items = sorted(
        disparities.items(),
        key=lambda kv: kv[1].get("disparity_score", 0),
        reverse=True,
    )[:max_attrs]
    trimmed = {}
    for attr, data in sorted_items:
        trimmed[attr] = {
            "disparity_score": data.get("disparity_score", 0),
            "risk_level":      data.get("risk_level", "Unknown"),
            "warning":         data.get("warning"),
        }
    return trimmed


def _truncate_proxies(proxies: list, max_items: int = 5) -> list:
    """Keep only the highest-scoring proxy features."""
    return [
        {
            "proxy_feature":       p.get("proxy_feature") or p.get("feature", "unknown"),
            "protected_attribute": p.get("protected_attribute") or p.get("max_protected", "unknown"),
            "severity":            p.get("severity") or p.get("risk_level", "Medium"),
        }
        for p in (proxies or [])[:max_items]
    ]


# ---------------------------------------------------------------------------
# Main explainer
# ---------------------------------------------------------------------------

def generate_fairness_explanation(disparities: dict, proxies: list) -> dict:
    """
    Generate a structured fairness explanation.

    - If GEMINI_API_KEY is set: calls Gemini once, returns structured JSON.
    - On any LLM failure: falls back to deterministic mock.
    - Inputs are truncated to ≤10 attributes and ≤5 proxies before sending.
    """
    if not disparities and not proxies:
        return get_mock_explanation({}, [])

    trimmed_disp  = _truncate_disparities(disparities)
    trimmed_prox  = _truncate_proxies(proxies)
    proxy_names   = [p["proxy_feature"] for p in trimmed_prox]

    if not GEMINI_API_KEY:
        logger.info("No GEMINI_API_KEY — using mock explanation.")
        return get_mock_explanation(disparities, proxies)

    try:
        from google import genai
        from google.genai import types

        prompt = (
            "You are an expert Responsible AI Auditor. Analyze the following findings "
            "and return ONLY a JSON object (no markdown fences).\n\n"
            f"Disparity findings (top attributes): {json.dumps(trimmed_disp)}\n"
            f"Proxy bias flags: {json.dumps(trimmed_prox)}\n\n"
            "Return JSON with keys:\n"
            "- summary: 1-2 sentence overall summary referencing specific attributes.\n"
            "- bias_locations: list of protected groups with highest disparity.\n"
            f"- root_causes: list of 2-3 causes (mention proxy features: {proxy_names}).\n"
            "- impact: 1-2 sentences on real-world harm if unmitigated.\n"
            "- recommendations: list of 2-3 specific, actionable steps.\n"
        )

        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=400,
                temperature=0.2,
            ),
        )
        text = response.text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        result = json.loads(text)
        logger.info("Gemini explanation generated successfully.")
        return result

    except Exception as exc:
        logger.error("Gemini call failed: %s — using mock fallback.", exc)
        return get_mock_explanation(disparities, proxies)


# ---------------------------------------------------------------------------
# Deterministic fallback
# ---------------------------------------------------------------------------

def get_mock_explanation(disparities: dict, proxies: list) -> dict:
    """Return a deterministic, metrics-driven explanation without any LLM call."""
    highest_risk_attr = "your dataset"
    max_disparity = 0.0
    for attr, data in (disparities or {}).items():
        score = data.get("disparity_score", 0)
        if score > max_disparity:
            max_disparity = score
            highest_risk_attr = attr

    proxy_names = [
        p.get("proxy_feature") or p.get("feature", "unknown")
        for p in (proxies or [])[:3]
    ]
    proxy_str = ", ".join(proxy_names) if proxy_names else "none detected"

    return {
        "summary": (
            f"Audit complete. Significant fairness risk detected around '{highest_risk_attr}' "
            f"(disparity score: {max_disparity:.1%})."
        ),
        "bias_locations": [f"{highest_risk_attr} subgroups"],
        "root_causes": [
            f"Historical bias in training labels for '{highest_risk_attr}'.",
            f"Proxy variables detected: {proxy_str}." if proxies else "No high-risk proxies detected.",
        ],
        "impact": (
            "Unmitigated bias may lead to systematic exclusion of sensitive subgroups, "
            "creating compliance, legal, and reputational risks."
        ),
        "recommendations": [
            "Apply threshold adjustment to equalize selection rates across subgroups.",
            "Remove or transform high-risk proxy features before retraining.",
            "Document findings in the Fairness Passport for compliance records.",
        ],
    }
