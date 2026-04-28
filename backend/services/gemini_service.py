import google.generativeai as genai
import json
import logging
import asyncio
from config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

# -------------------------------
# Gemini Initialization (ONE TIME)
# -------------------------------
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")
    structured_model = genai.GenerativeModel(
        "gemini-1.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "object",
                "properties": {
                    "explanation": {"type": "string"},
                    "governance_summary": {"type": "string"}
                },
                "required": ["explanation", "governance_summary"]
            }
        )
    )
else:
    model = None
    structured_model = None
    logger.warning("GEMINI_API_KEY not found. AI disabled.")


# -------------------------------
# Proxy Explanation (FIXED)
# -------------------------------
def generate_proxy_explanation(proxy_results: list[dict]) -> str:
    """
    Generate human-readable explanation for proxy bias.
    """
    if not model:
        return "AI Explanation unavailable: API key missing."

    # Limit input size
    truncated = sorted(proxy_results, key=lambda x: x.get("score", 0), reverse=True)[:15]

    prompt = f"""
You are an AI fairness expert focusing on Proxy Bias.

Proxy Bias Results:
{json.dumps(truncated, indent=2)}

Task:
Explain which features are acting as proxies and why they are risky.
Mention real-world implications and recommended mitigation steps.

Keep the explanation concise, clear, and professional. Avoid technical jargon.
"""

    try:
        response = model.generate_content(prompt, request_options={"timeout": 30})

        if response and response.text:
            return response.text.strip()

        return "Gemini failed to generate a response. Please check your data."

    except Exception as e:
        logger.error(f"Gemini Error in generate_proxy_explanation: {str(e)}")
        return "The analysis detected potential proxy variables that may indirectly encode protected attributes. We recommend reviewing features with high correlation scores."


# -------------------------------
# Generic Completion (SYNC)
# -------------------------------
def generate_completion(prompt: str, persona: str = "Expert AI Auditor", use_structured: bool = False) -> str:
    """
    Generic Gemini completion helper for multi-agent tasks.
    """
    if not model:
        return "{}" if use_structured else f"Service unavailable [{persona}]"

    try:
        full_prompt = f"Role: {persona}\n\nTask:\n{prompt}"
        
        target_model = structured_model if use_structured else model
        
        response = target_model.generate_content(
            full_prompt,
            request_options={"timeout": 30}
        )
        
        if response and response.text:
            return response.text.strip()
            
        return "{}" if use_structured else "No response generated."

    except Exception as e:
        logger.error(f"Gemini Completion Error: {str(e)}")
        return "{}" if use_structured else "Internal agent error during narrative generation."


# -------------------------------
# AI INSIGHT (OPTIMIZED)
# -------------------------------
async def generate_ai_insight(
    findings: list[dict],
    proxies: list[dict],
    mitigation: dict
) -> dict:
    """
    Produces a consolidated AI fairness narrative and governance summary.
    Optimized to use a single LLM call for multiple cognitive tasks.
    """
    if not model:
        return fallback_ai_insight()

    prompt = f"""
You are an AI fairness expert for FairLens Studio.

Input Data:
- Findings: {json.dumps(findings, indent=2)}
- Proxy Risks: {json.dumps(proxies, indent=2)}
- Mitigation Strategy: {json.dumps(mitigation, indent=2)}

Tasks:
1. Explain the fairness issues in simple, jargon-free language.
2. Provide a final governance recommendation based on the findings.

Format:
Return a STRICT JSON object with these keys:
- "explanation": string
- "governance_summary": string
"""

    try:
        # Run blocking call in thread (FIX for async)
        response_text = await asyncio.to_thread(
            generate_completion,
            prompt,
            "Fairness Copilot",
            True
        )
        
        data = json.loads(response_text) if response_text else {}
        
        return {
            "explanation": data.get("explanation", "Disparity detected in subgroup selection."),
            "governance_summary": data.get("governance_summary", "Status: Pending Mitigation.")
        }
        
    except Exception as e:
        logger.error(f"Generate AI insight failed: {str(e)}")
        return fallback_ai_insight()


def fallback_ai_insight() -> dict:
    return {
        "explanation": "The analysis detected disparities in selection rates across protected subgroups. This suggests potential modeling bias or representation gaps.",
        "governance_summary": "Status: Pending Mitigation. The model requires threshold adjustments or reweighting before safe deployment."
    }