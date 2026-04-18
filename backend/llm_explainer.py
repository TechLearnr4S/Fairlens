import os
import json
from google import genai
from google.genai import types
from config import GEMINI_API_KEY
from services.gemini_service import generate_proxy_explanation

def generate_fairness_explanation(disparities: dict, proxies: list) -> dict:
    """
    Generates a structured, detailed summary of the fairness audit results.
    Uses Gemini API if present, otherwise returns a mock structured response.
    """
    api_key = GEMINI_API_KEY
    findings_context = f"Disparities: {disparities}\nProxy Bias Flags: {proxies}"
    
    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            prompt = f"""
You are an expert Responsible AI Auditor. Analyze the following findings:
{findings_context}

Return a JSON object (strictly JSON, no markdown) with these keys:
- summary: 1-2 sentence overall summary.
- bias_locations: List of specific protected groups facing the highest disparity.
- root_causes: List of potential reasons (including proxy features like {[p['proxy_feature'] for p in proxies]}).
- impact: 1-2 sentence description of real-world negative impact if unmitigated.
- recommendations: List of 2-3 specific actions to take.
"""
            response = client.models.generate_content(
                model='gemini-2.0-flash', # Using flash for speed/cost
                contents=prompt,
                config=types.GenerateContentConfig(
                    max_output_tokens=500,
                    temperature=0.3
                )
            )
            # Clean response text in case of markdown wrapping
            text = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(text)
        except Exception as e:
            print(f"LLM Error: {e}")
            return get_mock_explanation(disparities, proxies)
    else:
        return get_mock_explanation(disparities, proxies)

def get_mock_explanation(disparities: dict, proxies: list) -> dict:
    highest_risk_attr = "Unknown"
    max_disparity = 0
    for attr, data in disparities.items():
        if data['disparity_score'] > max_disparity:
            max_disparity = data['disparity_score']
            highest_risk_attr = attr
            
    proxy_feature = proxies[0]['proxy_feature'] if proxies else "none detected"
    
    return {
        "summary": f"Audit complete. We identified significant fairness risk centered around '{highest_risk_attr}'.",
        "bias_locations": [f"{highest_risk_attr} subgroups"],
        "root_causes": [
            f"Historical bias in training labels for {highest_risk_attr}",
            f"Proxy variables detected: {proxy_feature}" if proxies else "No high-risk proxies detected"
        ],
        "impact": "Unmitigated bias could lead to systematic exclusion of sensitive subgroups, creating reputational and compliance risks.",
        "recommendations": [
            "Use threshold adjustment to equalize selection rates.",
            "Conduct manual feature review of proxy variables.",
            "Document findings in the Fairness Passport."
        ]
    }
