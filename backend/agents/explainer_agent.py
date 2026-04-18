import logging
from typing import Any, Dict
from ..services.gemini_service import generate_completion

logger = logging.getLogger(__name__)

def generate_plain_explanation(auditor_findings: Dict[str, Any]) -> str:
    """
    Triggers the Gemini-powered Explainer Agent to convert technical 
    audit findings into plain language.
    """
    key_findings = auditor_findings.get("key_findings", [])
    risk_level = auditor_findings.get("risk_level", "Unknown")

    if not key_findings:
        return "No specific fairness issues were identified in this audit."

    prompt = f"""
Please explain the following fairness audit findings in simple, non-technical terms:

Findings:
{chr(10).join(['- ' + f for f in key_findings])}
Overall Risk Level: {risk_level}

In your explanation, cover:
1. What is happening (the core disparity or risk)?
2. Why it matters (the ethical or social consequence)?
3. Who is affected (the specific groups being disadvantaged)?

Strict Requirements:
- Keep it to a single, impactful paragraph.
- Avoid technical jargon (don't use 'Pearson', 'Mutual Information', or 'p-values').
- Speak as if explaining to a non-technical manager.
"""

    return generate_completion(prompt, persona="AI Ethics Explainer")
