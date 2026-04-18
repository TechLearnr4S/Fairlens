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

def get_fallback_explanation() -> str:
    """
    Provides a generic fallback explanation if the API fails entirely.
    """
    return (
        "Potential proxy variables detected. High correlation between non-sensitive features "
        "and protected attributes suggests potential 'redundant encoding'. "
        "Recommendation: Review features with high proxy scores and consider de-biasing techniques."
    )
