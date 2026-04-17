import os
from google import genai
from google.genai import types

def generate_fairness_explanation(disparities: dict, proxies: list) -> str:
    """
    Generates a plain-language summary of the fairness audit results.
    Uses Google GenAI Gemini if the API key is present, otherwise returns a mock response.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    
    # Construct a string representation of the findings to feed the LLM
    findings_context = f"Disparities: {disparities}\nProxy Bias Flags: {proxies}"
    
    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            prompt = f"""
You are an expert Responsible AI Auditor. Look at the following fairness findings retrieved from a dataset:
{findings_context}

Provide a concise, plain-language summary (max 3 short paragraphs) intended for a non-technical product manager.
1. Highlight which protected groups face the most significant disparities.
2. Mention any features that act as hidden proxies for those protected groups.
3. Suggest a brief recommendation on how to mitigate this before deployment.
Format cleanly with no markdown codeblocks, just text and bullet points.
"""
            response = client.models.generate_content(
                model='gemini-2.5-pro',
                contents=prompt,
                config=types.GenerateContentConfig(
                    max_output_tokens=300,
                    temperature=0.4
                )
            )
            return response.text
        except Exception as e:
            return f"(API Error, falling back to basic explainer) - {str(e)}\n\n" + get_mock_explanation(disparities, proxies)
    else:
        return get_mock_explanation(disparities, proxies)


def get_mock_explanation(disparities: dict, proxies: list) -> str:
    """Fallback plain string explanation if AI is unconfigured"""
    highest_risk_attr = None
    max_disparity = 0
    for attr, data in disparities.items():
        if data['disparity_score'] > max_disparity:
            max_disparity = data['disparity_score']
            highest_risk_attr = attr
            
    proxy_text = ""
    if proxies:
        offender = proxies[0]
        proxy_text = f"We also detected that '{offender['proxy_feature']}' is acting as a hidden proxy for '{offender['protected_attribute']}', potentially smuggling bias into models even if you exclude '{offender['protected_attribute']}' directly."
        
    base = "We have completed the algorithmic bias review of the uploaded dataset."
    if highest_risk_attr:
        base += f" Our analysis identified highest fairness risk around the '{highest_risk_attr}' protected attribute, exhibiting a demographic parity difference of {max_disparity:.2f}."
        
    return f"{base}\n\n{proxy_text}\n\nRecommendation: For the '{highest_risk_attr}' disparity, we recommend exploring mitigation strategies such as Correlation Removal or Threshold Tuning to decouple the outcome dependency. A thorough manual review of the detected proxy variables should also be conducted before production deployment."
