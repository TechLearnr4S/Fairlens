import google.generativeai as genai
import json
import logging
from config import GEMINI_API_KEY

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning("GEMINI_API_KEY not found in config. AI services will be unavailable.")

    Returns:
    - Human-readable explanation text
    """
    if not GEMINI_API_KEY:
        return "AI Explanation unavailable: API Key missing. Check your backend .env file."

    # ── 1. Input Hardening: Truncate results to avoid token overflow ─────
    # We focus on the top 15 highest-risk features
    truncated_results = sorted(
        proxy_results, 
        key=lambda x: x.get('score', 0), 
        reverse=True
    )[:15]

    try:
        # Initialize the model
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # ── 2. Request Hardening: Set timeouts ──────────────────────────────
        # 30 second timeout for the generation request
        request_options = {"timeout": 30.0}
        
        # Construct the specific prompt as requested
        prompt = f"""
Given the following proxy bias analysis results:
{json.dumps(truncated_results, indent=2)}

Explain:
- which features are acting as proxies
- why they are risky
- real-world implications
- recommended mitigation steps

Keep the explanation concise, clear, and focused on helping a non-technical stakeholder understand the risks.
"""
        
        # Generate content with timeout
        response = model.generate_content(
            prompt,
            request_options=request_options
        )
        
        if response and response.text:
            return response.text.strip()
        else:
            return "Gemini failed to generate a response. Please check your data and try again."

    except Exception as e:
        # Sanitize logs: don't log the prompt or payload which might be huge
        error_type = type(e).__name__
        logger.error(f"Gemini API Error [{error_type}]: {str(e)}")
        return get_fallback_explanation()


def generate_completion(prompt: str, persona: str = "Expert AI Auditor") -> str:
    """
    Generic Gemini completion helper for multi-agent tasks.
    """
    if not GEMINI_API_KEY:
        return f"Service unavailable. [{persona}]"

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        full_prompt = f"Role: {persona}\n\nTask: {prompt}"
        
        response = model.generate_content(
            full_prompt,
            request_options={"timeout": 30.0}
        )
        
        if response and response.text:
            return response.text.strip()
        return "No response generated."
    except Exception as e:
        logger.error(f"Gemini Completion Error: {str(e)}")
        return "Internal agent error."


async def generate_ai_insight(findings: list[dict], proxies: list[dict], mitigation: dict) -> dict[str, str]:
    """
    Produces a consolidated AI fairness narrative and governance summary.
    Optimized to use a single LLM call for multiple cognitive tasks.
    """
    prompt = f"""
You are an AI fairness expert for FairLens Studio.

Input Data:
- Findings: {json.dumps(findings, indent=2)}
- Proxy Risks: {json.dumps(proxies, indent=2)}
- Mitigation Strategy: {json.dumps(mitigation, indent=2)}

Tasks:
1. Explain the fairness issues in simple, jargon-free language.
2. Identify root causes for the detected bias.
3. Describe the real-world impact if this model were deployed.
4. Provide a final governance recommendation.

Constraints:
- Max 150 words total.
- Be clear, authoritative, and professional.
- Avoid technical jargon (e.g., don't say 'Pearson correlation').

Format:
Return a JSON object with:
{{
  "explanation": "concise plain language explanation",
  "governance_summary": "deployment recommendation and summary"
}}
"""
    try:
        # Use a more restrictive persona for governance
        response_text = await generate_completion(prompt, persona="Fairness Copilot")
        
        # Clean response if LLM adds markdown backticks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        data = json.loads(response_text)
        return {
            "explanation": data.get("explanation", "Bias detected across subgroups."),
            "governance_summary": data.get("governance_summary", "Further review suggested.")
        }
    except Exception as e:
        logger.error(f"Generate AI insight failed: {e}")
        return {
            "explanation": "The analysis detected disparities in selection rates across protected subgroups. This suggests potential modeling bias or representation gaps in the training data.",
            "governance_summary": "Status: Pending Mitigation. The model requires threshold adjustments or reweighting before safe deployment."
        }


def get_fallback_explanation() -> str:
    """
    Provides a generic fallback explanation if the API fails entirely.
    """
    return (
        "Potential proxy variables detected. High correlation between non-sensitive features "
        "and protected attributes suggests potential 'redundant encoding'. "
        "Recommendation: Review features with high proxy scores and consider de-biasing techniques."
    )
