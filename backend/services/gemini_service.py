import json
import logging
import asyncio
from google import genai
from google.genai import types
from config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

# ── Gemini Client Initialisation ─────────────────────────────────────────────
if GEMINI_API_KEY:
    _client = genai.Client(api_key=GEMINI_API_KEY)
    _MODEL = "gemini-2.0-flash"
    logger.info("Gemini 2.0 Flash client initialised.")
else:
    _client = None
    _MODEL = None
    logger.warning("GEMINI_API_KEY not found. AI features disabled.")


# ── Structured Output Schema ──────────────────────────────────────────────────
# Guarantees Gemini returns valid, typed JSON — no regex/parse hacks needed.
AUDIT_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "explanation": types.Schema(
            type=types.Type.STRING,
            description="Plain-language explanation of the bias findings for a non-technical audience."
        ),
        "governance_summary": types.Schema(
            type=types.Type.STRING,
            description="Deployment recommendation and governance action required."
        ),
        "regulatory_risk": types.Schema(
            type=types.Type.STRING,
            description="Applicable laws or regulations potentially implicated by this bias."
        ),
        "severity": types.Schema(
            type=types.Type.STRING,
            enum=["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            description="Severity classification of the detected bias."
        ),
        "recommended_action": types.Schema(
            type=types.Type.STRING,
            description="Single most important remediation step the organization should take."
        ),
    },
    required=["explanation", "governance_summary", "severity"],
)

# ── Proxy Explanation ─────────────────────────────────────────────────────────
def generate_proxy_explanation(proxy_results: list[dict]) -> str:
    """Generate human-readable explanation for proxy bias."""
    if not _client:
        return "AI Explanation unavailable: API key missing."

    truncated = sorted(proxy_results, key=lambda x: x.get("score", 0), reverse=True)[:15]

    prompt = (
        "You are an AI fairness expert focusing on Proxy Bias.\n\n"
        f"Proxy Bias Results:\n{json.dumps(truncated, indent=2)}\n\n"
        "Task: Explain which features are acting as proxies and why they are risky. "
        "Mention real-world implications and recommended mitigation steps. "
        "Keep the explanation concise, clear, and professional. Avoid technical jargon."
    )

    try:
        response = _client.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=400, temperature=0.2),
        )
        return response.text.strip() if response and response.text else "Gemini failed to generate a response."
    except Exception as e:
        logger.error("Gemini Error in generate_proxy_explanation: %s", e)
        return (
            "The analysis detected potential proxy variables that may indirectly encode "
            "protected attributes. Review features with high correlation scores."
        )


# ── Generic Completion (sync) ─────────────────────────────────────────────────
def generate_completion(prompt: str, persona: str = "Expert AI Auditor", use_structured: bool = False) -> str:
    """Generic Gemini completion helper for multi-agent tasks."""
    if not _client:
        return "{}" if use_structured else f"Service unavailable [{persona}]"

    try:
        full_prompt = f"Role: {persona}\n\nTask:\n{prompt}"

        if use_structured:
            config = types.GenerateContentConfig(
                max_output_tokens=800,
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=AUDIT_SCHEMA,  # Enforces typed JSON — no parse errors
            )
        else:
            config = types.GenerateContentConfig(
                max_output_tokens=600,
                temperature=0.2,
            )

        response = _client.models.generate_content(
            model=_MODEL,
            contents=full_prompt,
            config=config,
        )
        return response.text.strip() if response and response.text else ("{}" if use_structured else "No response generated.")
    except Exception as e:
        logger.error("Gemini Completion Error: %s", e)
        return "{}" if use_structured else "Internal agent error during narrative generation."


# ── AI Insight (async, consolidated single call) ──────────────────────────────
async def generate_ai_insight(findings: list[dict], proxies: list[dict], mitigation: dict) -> dict:
    """
    Produces a consolidated AI fairness narrative and governance summary.
    Optimised to use a single LLM call with structured JSON output.
    """
    if not _client:
        return {
            "explanation": "The analysis detected disparities in selection rates across protected subgroups.",
            "governance_summary": "Status: Pending Mitigation. The model requires threshold adjustments.",
            "regulatory_risk": "Potential compliance risk under automated decision-making regulations.",
            "severity": "MEDIUM",
            "recommended_action": "Review feature correlations and apply threshold adjustments."
        }

    prompt = (
        "You are an AI fairness expert for FairLens Studio.\n\n"
        "Input Data:\n"
        f"- Findings: {json.dumps(findings, indent=2)}\n"
        f"- Proxy Risks: {json.dumps(proxies, indent=2)}\n"
        f"- Mitigation Strategy: {json.dumps(mitigation, indent=2)}\n\n"
        "Tasks:\n"
        "1. Explain the fairness issues in simple, jargon-free language.\n"
        "2. Provide a final governance recommendation based on the findings.\n"
        "3. Assess regulatory risks, severity level, and recommended actions.\n"
    )

    try:
        # 1. Add structured response schema
        schema = types.Schema(
            type=types.Type.OBJECT,
            properties={
                "explanation": types.Schema(type=types.Type.STRING),
                "governance_summary": types.Schema(type=types.Type.STRING),
                "regulatory_risk": types.Schema(type=types.Type.STRING),
                "severity": types.Schema(
                    type=types.Type.STRING,
                    enum=["LOW", "MEDIUM", "HIGH", "CRITICAL"]
                ),
                "recommended_action": types.Schema(type=types.Type.STRING),
            },
            required=["explanation", "governance_summary", "severity"],
        )

        # 2. Use response_mime_type="application/json"
        # 3. Add response_schema
        response = await asyncio.to_thread(
            _client.models.generate_content,
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=800,
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=schema,
            )
        )
        
        response_text = response.text.strip() if response and response.text else "{}"
        
        # 4. Safely parse response into Python dict
        try:
            data = json.loads(response_text)
        # 5. Add fallback if JSON parsing fails
        except json.JSONDecodeError:
            logger.error("JSON parsing failed for response: %s", response_text)
            data = {}
            
        return {
            "explanation":        data.get("explanation", "Disparity detected in subgroup selection."),
            "governance_summary": data.get("governance_summary", "Status: Pending Mitigation."),
            "regulatory_risk":    data.get("regulatory_risk", "Potential compliance risk."),
            "severity":           data.get("severity", "MEDIUM"),
            "recommended_action": data.get("recommended_action", "Review feature correlations."),
        }
    except Exception as e:
        logger.error("Generate AI insight failed: %s", e)
        return {
            "explanation": "The analysis detected disparities in selection rates across protected subgroups.",
            "governance_summary": "Status: Pending Mitigation. The model requires threshold adjustments.",
            "regulatory_risk": "Potential compliance risk under automated decision-making regulations.",
            "severity": "MEDIUM",
            "recommended_action": "Review feature correlations and apply threshold adjustments."
        }



def fallback_ai_insight() -> dict:
    return {
        "explanation": (
            "The analysis detected disparities in selection rates across protected subgroups. "
            "This suggests potential modeling bias or representation gaps."
        ),
        "governance_summary": (
            "Status: Pending Mitigation. The model requires threshold adjustments or "
            "reweighting before safe deployment."
        ),
    }