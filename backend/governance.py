"""
governance.py
=============
Enterprise-grade Fairness Passport generation for FairLens Studio.

Provides:
- compute_risk_assessment()  — Intelligent weighted risk scoring
- generate_decision()        — Explainable deployment decision engine
- build_fairness_passport()  — Full structured passport builder
- generate_audit_receipt()   — Tamper-evident SHA-256 signed receipt (legacy)
- generate_fairness_passport() — Markdown report (legacy, kept for compatibility)
"""

import json
import hashlib
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val, fallback: float = 0.0) -> float:
    """Safely convert any value to float, returning fallback on failure."""
    try:
        return float(val) if val is not None else fallback
    except (TypeError, ValueError):
        return fallback


def _np_mean(data: list) -> float:
    if not data:
        return 0.0
    return sum(data) / len(data)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Regulatory Mapping — Legal Compliance Layer
# ---------------------------------------------------------------------------
# Maps each use-case to the applicable law, threshold metric, and remediation.
# This turns a disparity score into a legal finding.

REGULATORY_FRAMEWORKS: dict = {
    "Hiring": {
        "law":       "EEOC Uniform Guidelines on Employee Selection Procedures — 4/5ths (80%) Rule",
        "body":      "U.S. Equal Employment Opportunity Commission",
        "metric":    "disparate_impact_ratio",
        "threshold": 0.80,
        "violation": (
            "The selection rate for the minority group is below 80% of the majority group's rate, "
            "indicating potential adverse impact under the EEOC 4/5ths Rule."
        ),
        "remediation": (
            "Document business necessity for the selection criterion, or modify procedures to "
            "reduce adverse impact. Consider alternative methods with equivalent validity."
        ),
        "reference": "29 CFR Part 1607",
    },
    "Credit Scoring": {
        "law":       "Equal Credit Opportunity Act (ECOA) / Fair Housing Act (FHA)",
        "body":      "Consumer Financial Protection Bureau (CFPB)",
        "metric":    "tpr_gap",
        "threshold": 0.10,
        "violation": (
            "True positive rate gap exceeds 10% across protected groups, suggesting potential "
            "disparate impact in credit decisions under ECOA."
        ),
        "remediation": (
            "Review underwriting model features for disparate impact on protected classes. "
            "Consider alternative data sources or calibration across demographic groups."
        ),
        "reference": "15 U.S.C. § 1691",
    },
    "Healthcare": {
        "law":       "ACA Section 1557 — Non-Discrimination in Health Programs and Activities",
        "body":      "U.S. Department of Health and Human Services (HHS)",
        "metric":    "fpr_gap",
        "threshold": 0.05,
        "violation": (
            "False positive rate gap exceeds 5% across demographic groups, indicating potential "
            "discrimination in healthcare decisions under ACA Section 1557."
        ),
        "remediation": (
            "Conduct clinical validation of the algorithm across all demographic subgroups. "
            "Engage an independent auditor before clinical deployment."
        ),
        "reference": "42 U.S.C. § 18116",
    },
    "Criminal Justice": {
        "law":       "Equal Protection Clause — 14th Amendment / ProPublica COMPAS Standards",
        "body":      "U.S. Department of Justice",
        "metric":    "fpr_gap",
        "threshold": 0.10,
        "violation": (
            "False positive rate gap exceeds 10% across racial groups, consistent with the "
            "disparate error rate documented in risk assessment tools like COMPAS."
        ),
        "remediation": (
            "Recalibrate recidivism score thresholds independently for each demographic group. "
            "Implement mandatory human review before any detention decisions."
        ),
        "reference": "U.S. Const. amend. XIV",
    },
    "Other": {
        "law":       "General AI Fairness Principles (EU AI Act / IEEE Ethically Aligned Design)",
        "body":      "European Commission / IEEE",
        "metric":    "disparity_score",
        "threshold": 0.20,
        "violation": (
            "Disparity score exceeds 20%, suggesting meaningful bias in automated decisions "
            "that may conflict with emerging AI fairness regulations."
        ),
        "remediation": (
            "Conduct a full bias audit with domain experts. Apply appropriate mitigation "
            "before deployment. Document all findings for regulatory compliance."
        ),
        "reference": "EU AI Act Art. 10 / IEEE P7003",
    },
}

# Extensible synonym map → canonical ``REGULATORY_FRAMEWORKS`` keys.
USE_CASE_ALIASES: dict[str, str] = {
    "credit": "Credit Scoring",
    "Credit": "Credit Scoring",
    "lending": "Credit Scoring",
    "Lending": "Credit Scoring",
    "healthcare": "Healthcare",
    "Health": "Healthcare",
    "health": "Healthcare",
}

# Concise statutory labels surfaced in APIs (paired with frameworks below).
LAW_HEADLINE_BY_USE_CASE: dict[str, str] = {
    "Hiring": (
        "EEOC Uniform Guidelines — 4/5ths (80%) Rule (adverse impact / disparate impact)"
    ),
    "Credit Scoring": (
        "Equal Credit Opportunity Act (ECOA) / FHA — disparate treatment & impact"
    ),
    "Healthcare": (
        "ACA Section 1557 — non-discrimination in health programs and clinical algorithms"
    ),
    "Criminal Justice": (
        "Equal Protection / COMPAS-style disparate error parity"
    ),
    "Other": "IEEE / EU AI Act — proportional disparity bounds",
}

LAW_SHORT_LABEL_BY_USE_CASE: dict[str, str] = {
    "Hiring": "EEOC 80% Rule",
    "Credit Scoring": "ECOA",
    "Healthcare": "ACA 1557",
    "Criminal Justice": "Equal Protection",
    "Other": "General AI Fairness",
}

METRIC_DISPLAY_LABELS: dict[str, str] = {
    "disparate_impact_ratio": "Disparate Impact",
    "disparity_score": "Disparity Score",
    "tpr_gap": "TPR Gap",
    "fpr_gap": "FPR Gap",
    "fnr_gap": "FNR Gap",
    "fpr_disparity": "FPR Disparity",
    "fnr_disparity": "FNR Disparity",
}

REMEDIATION_BY_USE_CASE: dict[str, str] = {
    "Hiring": "Adjust model or justify business necessity.",
    "Credit Scoring": "Recalibrate credit policy and remove disparate-impact drivers.",
    "Healthcare": "Recalibrate clinical thresholds and validate on all subgroups.",
    "Criminal Justice": "Recalibrate risk thresholds and require human review.",
    "Other": "Apply bias mitigation and document governance controls.",
}


def _canonical_use_case(use_case: str) -> str:
    if not isinstance(use_case, str) or not use_case.strip():
        return "Other"
    t = use_case.strip()
    return USE_CASE_ALIASES.get(t, t)


def _severity_di_eeoc(value: float, threshold: float, violation: bool) -> str:
    """Hiring — EEOC 80% rule: violation when ``0 < value < threshold`` (minority/min selection ratio)."""
    if not violation:
        return "NONE"
    if value <= 0:
        return "CRITICAL"
    slack = threshold - value
    # Deeper departures below 80% → higher severity.
    if slack >= 0.30:
        return "CRITICAL"
    if slack >= 0.15:
        return "HIGH"
    if slack >= 0.05:
        return "MEDIUM"
    return "LOW"


def _severity_gap_upper_ecoa(value: float, threshold: float, violation: bool) -> str:
    """Credit — ECOA / TPR gap: higher gap than threshold is worse."""
    if not violation:
        return "NONE"
    excess = value - threshold
    if excess >= threshold * 2.5 or value >= threshold * 3.5:
        return "CRITICAL"
    if excess >= threshold * 1.2 or value >= threshold * 2.2:
        return "HIGH"
    if excess >= threshold * 0.45:
        return "MEDIUM"
    return "LOW"


def _severity_gap_upper_aca(value: float, threshold: float, violation: bool) -> str:
    """Healthcare — ACA § 1557 FPR-gap: tighter clinical band."""
    if not violation:
        return "NONE"
    excess = value - threshold
    if value >= threshold * 4 or excess >= 0.25:
        return "CRITICAL"
    if excess >= threshold * 2.5 or value >= threshold * 2.8:
        return "HIGH"
    if excess >= threshold * 1.0:
        return "MEDIUM"
    return "LOW"


def _severity_gap_upper_general(value: float, threshold: float, violation: bool) -> str:
    """Other / secondary metrics — conservative gap tiers."""
    if not violation:
        return "NONE"
    excess = value - threshold
    rel = excess / threshold if threshold > 1e-12 else excess
    if rel > 2.0 or value >= threshold * 3.0:
        return "CRITICAL"
    if rel > 1.0 or value >= threshold * 2.0:
        return "HIGH"
    if rel > 0.35:
        return "MEDIUM"
    return "LOW"


def _severity_criminal_gap(value: float, threshold: float, violation: bool) -> str:
    if not violation:
        return "NONE"
    excess = value - threshold
    if excess >= threshold * 2.2 or value >= threshold * 3.2:
        return "CRITICAL"
    if excess >= threshold * 1.1:
        return "HIGH"
    if excess >= threshold * 0.4:
        return "MEDIUM"
    return "LOW"


def _compute_severity(
    *,
    canonical_use: str,
    metric_name: str,
    value: float,
    threshold_used: float,
    violation: bool,
    is_di_metric: bool,
    is_secondary_metric: bool,
) -> str:
    """Dispatch deterministic severity tier (NONE | LOW | MEDIUM | HIGH | CRITICAL)."""
    if is_di_metric:
        return _severity_di_eeoc(value, threshold_used, violation)
    if is_secondary_metric:
        return _severity_gap_upper_general(value, threshold_used, violation)
    if canonical_use == "Hiring":
        return _severity_gap_upper_general(value, threshold_used, violation)
    if canonical_use == "Credit Scoring":
        return _severity_gap_upper_ecoa(value, threshold_used, violation)
    if canonical_use == "Healthcare":
        return _severity_gap_upper_aca(value, threshold_used, violation)
    if canonical_use == "Criminal Justice":
        return _severity_criminal_gap(value, threshold_used, violation)
    return _severity_gap_upper_general(value, threshold_used, violation)


def evaluate_regulatory_risk(metric_name: str, value: float, use_case: str) -> dict:
    """
    Deterministic regulatory check for one ``(metric_name, value)`` under a use case.

    **Regs**

    - **Hiring** → EEOC 80% / four-fifths on ``disparate_impact_ratio`` (values strictly between 0 and 0.8 violate).
    - **Credit Scoring** → ECOA-style upward gap metrics (typically ``value > threshold`` on ``tpr_gap``).
    - **Healthcare** → ACA Section 1557 on tighter ``fpr_gap`` bounds.

    Add new regimes by extending ``REGULATORY_FRAMEWORKS`` and optionally ``USE_CASE_ALIASES``.
    Severity is reproducible — no RNG or timestamps in output.

    Returns
    -------
    dict
        ``law``, ``metric``, ``value``, ``threshold``, ``violation``, ``severity``,
        ``explanation``, ``remediation``.
    """
    v = float(value)
    canonical = _canonical_use_case(use_case)

    fw = REGULATORY_FRAMEWORKS.get(canonical, REGULATORY_FRAMEWORKS["Other"])
    fw_other = REGULATORY_FRAMEWORKS["Other"]
    fw_hiring = REGULATORY_FRAMEWORKS["Hiring"]

    primary_metric = fw["metric"]
    law_long = LAW_HEADLINE_BY_USE_CASE.get(canonical, fw["law"])
    law_short = LAW_SHORT_LABEL_BY_USE_CASE.get(canonical, fw.get("law", "General AI Fairness"))
    metric_label = METRIC_DISPLAY_LABELS.get(metric_name, metric_name.replace("_", " ").title())

    violation = False
    threshold_used = fw["threshold"]
    cite_fw = fw
    is_di_metric = False
    is_secondary_metric = False

    # Dynamic threshold selection — which rule applies to this column.
    if metric_name == "disparate_impact_ratio":
        cite_fw = fw_hiring
        threshold_used = fw_hiring["threshold"]
        is_di_metric = True
        violation = bool(v > 0 and v < threshold_used)
    elif metric_name == primary_metric:
        cite_fw = fw
        threshold_used = fw["threshold"]
        if primary_metric == "disparate_impact_ratio":
            is_di_metric = True
            violation = bool(v > 0 and v < threshold_used)
        else:
            violation = bool(v > threshold_used)
    else:
        is_secondary_metric = True
        cite_fw = fw_other
        threshold_used = fw_other["threshold"]
        violation = bool(v > threshold_used)

    severity = _compute_severity(
        canonical_use=canonical,
        metric_name=metric_name,
        value=v,
        threshold_used=threshold_used,
        violation=violation,
        is_di_metric=is_di_metric,
        is_secondary_metric=is_secondary_metric,
    )
    if severity == "NONE":
        severity = "LOW"

    comparator = "below" if is_di_metric else "above"
    cmp_word = "below" if is_di_metric else "within"
    if violation:
        explanation = (
            f"{metric_label} is {v:.2f}, {comparator} the {threshold_used:.2f} threshold under {law_short}."
        )
        remediation = REMEDIATION_BY_USE_CASE.get(canonical, "Apply bias mitigation and document governance controls.")
    else:
        explanation = (
            f"{metric_label} is {v:.2f}, {cmp_word} the {threshold_used:.2f} threshold under {law_short}."
        )
        remediation = "Continue monitoring and keep an auditable compliance record."

    return {
        "law": law_short,
        "metric": metric_label,
        "metric_key": metric_name,
        "value": round(v, 6),
        "threshold": threshold_used,
        "violation": violation,
        "severity": severity,
        "explanation": explanation,
        "remediation": remediation,
        "framework": law_long,
    }


def compute_regulatory_compliance(
    use_case: str,
    disparities: dict,
    proxies: list,
) -> dict:
    """
    Evaluate audit results against the applicable regulatory framework for the use-case.

    Returns a compliance dict with:
      - framework: law name, body, reference
      - status: "COMPLIANT" | "REVIEW_REQUIRED" | "VIOLATION_DETECTED"
      - violations: list of specific findings
      - remediation_steps: ordered list of actions
    """
    fw = REGULATORY_FRAMEWORKS.get(use_case, REGULATORY_FRAMEWORKS["Other"])
    metric = fw["metric"]
    threshold = fw["threshold"]

    violations = []
    for attr, data in disparities.items():
        score = _safe_float(data.get(metric) or data.get("disparity_score"))
        if metric == "disparate_impact_ratio":
            # Lower is worse for disparate impact ratio
            if score > 0 and score < threshold:
                violations.append({
                    "attribute": attr,
                    "metric":    metric,
                    "value":     round(score, 4),
                    "threshold": threshold,
                    "detail":    fw["violation"],
                })
        else:
            # Higher gap is worse for tpr_gap / fpr_gap / disparity_score
            if score > threshold:
                violations.append({
                    "attribute": attr,
                    "metric":    metric,
                    "value":     round(score, 4),
                    "threshold": threshold,
                    "detail":    fw["violation"],
                })

    if violations:
        status = "VIOLATION_DETECTED"
    elif any(
        _safe_float(d.get("disparity_score")) > threshold * 0.7
        for d in disparities.values()
    ):
        status = "REVIEW_REQUIRED"
    else:
        status = "COMPLIANT"

    return {
        "framework": {
            "name":      fw["law"],
            "body":      fw["body"],
            "reference": fw["reference"],
        },
        "use_case":          use_case,
        "status":            status,
        "violations":        violations,
        "remediation_steps": [fw["remediation"]] if violations else [],
        "evaluated_at":      _now_iso(),
    }

# ---------------------------------------------------------------------------

def compute_risk_assessment(
    disparities: dict,
    proxies: list,
) -> dict:
    """
    Compute a weighted risk score from multiple signals.

    Weighting:
      - Disparity severity  : 50%
      - Proxy risk severity  : 30%
      - Group spread (count) : 20%

    Thresholds:
      > 0.6 → High
      0.3–0.6 → Medium
      < 0.3 → Low
    """
    # --- Component 1: Disparity (50%) ---
    disparity_scores = [_safe_float(d.get("disparity_score")) for d in disparities.values()]
    max_disparity = max(disparity_scores) if disparity_scores else 0.0
    disparity_component = min(max_disparity, 1.0)  # cap at 1.0

    # --- Component 2: Proxy Risk (30%) ---
    severity_map = {"Low": 0.2, "Medium": 0.5, "High": 0.8, "Critical": 1.0}
    proxy_scores = []
    for p in proxies:
        sev = p.get("severity") or p.get("risk_level", "Low")
        proxy_scores.append(severity_map.get(sev, 0.3))
    proxy_component = max(proxy_scores) if proxy_scores else 0.0

    # --- Component 3: Group Spread (20%) ---
    affected_count = sum(1 for d in disparities.values() if _safe_float(d.get("disparity_score")) > 0.1)
    total_groups = max(len(disparities), 1)
    spread_component = min(affected_count / total_groups, 1.0)

    # --- Weighted Sum ---
    risk_score = round(
        (disparity_component * 0.50)
        + (proxy_component * 0.30)
        + (spread_component * 0.20),
        4,
    )

    if risk_score > 0.6:
        risk_level = "High"
    elif risk_score >= 0.3:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "components": {
            "disparity_component": round(disparity_component, 4),
            "proxy_component": round(proxy_component, 4),
            "spread_component": round(spread_component, 4),
        },
    }


# ---------------------------------------------------------------------------
# 2. Explainable Decision Engine
# ---------------------------------------------------------------------------

def generate_decision(
    risk_assessment: dict,
    disparities: dict,
    proxies: list,
    simulation: dict | None,
) -> dict:
    """
    Produce a structured, explainable deployment decision.

    Rules:
      - High risk → Reject
      - Medium risk + effective mitigation → Conditional
      - Low risk → Approve

    Returns a decision dict with status, confidence, reason, and summary.
    """
    risk_level = risk_assessment.get("risk_level", "High")
    risk_score = _safe_float(risk_assessment.get("risk_score"), 0.5)

    # High-risk proxy features for the reason text
    high_proxies = [
        p.get("proxy_feature") or p.get("feature", "unknown")
        for p in proxies
        if (p.get("severity") or p.get("risk_level", "")).upper() in ("HIGH", "CRITICAL")
    ]

    # Max disparity stat for reason text
    max_attr, max_val = "N/A", 0.0
    for attr, d in disparities.items():
        val = _safe_float(d.get("disparity_score"))
        if val > max_val:
            max_attr, max_val = attr, val

    # Mitigation effectiveness
    bias_reduction = _safe_float(
        (simulation or {}).get("delta", {}).get("disparity_reduction_pct")
        or (simulation or {}).get("improvement")
    )
    mitigation_effective = bias_reduction >= 30  # ≥30% reduction is considered effective

    # --- Decision logic ---
    if risk_level == "High":
        status = "Reject"
        confidence = round(min(0.6 + risk_score * 0.4, 0.99), 2)
        if high_proxies:
            reason = (
                f"High disparity ({max_val:.3f}) persists across '{max_attr}' groups "
                f"and proxy feature(s) {', '.join(repr(p) for p in high_proxies)} "
                f"remain influential despite mitigation."
            )
        else:
            reason = (
                f"High disparity ({max_val:.3f}) detected across '{max_attr}' groups. "
                f"No adequate mitigation strategy has been applied."
            )

    elif risk_level == "Medium":
        if mitigation_effective:
            status = "Conditional"
            confidence = round(max(0.45, 1.0 - risk_score), 2)
            reason = (
                f"Moderate disparity ({max_val:.3f}) detected across '{max_attr}' groups. "
                f"Simulation shows {bias_reduction:.1f}% bias reduction. "
                f"Conditional approval granted; requires ongoing monitoring."
            )
        else:
            status = "Conditional"
            confidence = round(max(0.35, 1.0 - risk_score), 2)
            reason = (
                f"Moderate disparity ({max_val:.3f}) detected across '{max_attr}' groups. "
                f"Mitigation has not been demonstrated to be effective. "
                f"Deployment requires human oversight and re-evaluation."
            )
    else:
        status = "Approve"
        confidence = round(min(0.75 + (0.3 - risk_score), 0.99), 2)
        reason = (
            f"No significant disparity detected (max: {max_val:.3f} on '{max_attr}'). "
            f"Risk score of {risk_score:.2f} is within acceptable thresholds. "
            f"Safe for deployment with standard monitoring."
        )

    # One-line summary for the top of the UI
    if status == "Reject":
        summary = (
            f"Model is not deployment-ready due to high disparity and "
            f"{'unresolved proxy bias.' if high_proxies else 'insufficient mitigation.'}"
        )
    elif status == "Conditional":
        summary = (
            "Model may be deployed under conditional oversight; "
            "fairness concerns require active monitoring."
        )
    else:
        summary = "Model meets fairness thresholds and is approved for deployment."

    return {
        "status": status,
        "confidence": confidence,
        "reason": reason,
        "summary": summary,
    }


def generate_narrative_summary(data: dict) -> str:
    """
    Combines all audit signals into a cohesive, story-like narrative summary.
    """
    results = data.get("results", {})
    config = data.get("config", {})
    
    disparities = results.get("disparities") or {}
    proxies = results.get("proxies") or []
    simulation = results.get("simulation") or {}
    
    # 1. Identify main bias source
    if disparities:
        max_attr = max(disparities.keys(), key=lambda k: _safe_float(disparities[k].get("disparity_score")))
        bias_source = f"bias across '{max_attr}' subgroups"
    else:
        bias_source = "minimal initial bias"
        
    # 2. Add proxy context
    proxy_context = ""
    if proxies:
        high_risk = [p.get("feature") or p.get("proxy_feature", "unknown") for p in proxies if _safe_float(p.get("risk_score") or p.get("correlation_score") or p.get("score")) > 0.7]
        if high_risk:
            proxy_context = f" likely driven by '{high_risk[0]}' acting as a proxy."
        else:
            proxy_context = " with some features showing indirect correlation to sensitive traits."
            
    # 3. Add mitigation result
    mitigation_story = "No mitigation strategy was applied."
    if simulation:
        delta = simulation.get("delta", {})
        reduction = _safe_float(delta.get("disparity_reduction_pct") or simulation.get("improvement"))
        tradeoff = _safe_float(delta.get("accuracy_change_pct") or simulation.get("accuracy_tradeoff"))
        
        if reduction > 20:
            mitigation_story = f"Implementing the recommended mitigation reduced group disparity by {reduction:.1f}% with a {abs(tradeoff):.1f}% accuracy trade-off."
        else:
            mitigation_story = f"The attempted mitigation had a limited {reduction:.1f}% impact on reducing group disparity."
            
    # 4. Final conclusion (Decision)
    risk = compute_risk_assessment(disparities, proxies)
    decision = generate_decision(risk, disparities, proxies, simulation)
    conclusion = f"The system is now {decision['status'].lower()} for deployment."
    
    return f"The model initially showed {bias_source}{proxy_context} {mitigation_story} {conclusion}"


# ---------------------------------------------------------------------------
# 3. Audit Trace Builder
# ---------------------------------------------------------------------------

def build_audit_trace(data: dict) -> list:
    """
    Build a chronological list of timestamped audit events from LOCAL_DATASTORE data.
    Falls back gracefully if events are missing.
    """
    trace = []

    # Dataset upload
    if data.get("filename"):
        trace.append({
            "action": "DATASET_UPLOADED",
            "timestamp": data.get("upload_time", _now_iso()),
            "details": {
                "filename": data.get("filename", "unknown"),
                "rows": int(data.get("row_count", 0)),
            },
        })

    # Fairness analysis
    if data.get("results", {}).get("disparities"):
        trace.append({
            "action": "FAIRNESS_RUN",
            "timestamp": data.get("analysis_time", _now_iso()),
            "details": {
                "target_column": data.get("config", {}).get("target", "unknown"),
                "protected_attributes": data.get("config", {}).get("protected", []),
                "attributes_scanned": len(data["results"]["disparities"]),
            },
        })

    # Proxy detection
    if data.get("results", {}).get("proxies"):
        trace.append({
            "action": "PROXY_DETECTION",
            "timestamp": data.get("proxy_time", _now_iso()),
            "details": {
                "proxies_found": len(data["results"]["proxies"]),
                "high_risk_count": sum(
                    1 for p in data["results"]["proxies"]
                    if (p.get("severity") or p.get("risk_level", "")).upper() in ("HIGH", "CRITICAL")
                ),
            },
        })

    # Bias simulation
    if data.get("results", {}).get("simulation"):
        sim = data["results"]["simulation"]
        trace.append({
            "action": "SIMULATION_APPLIED",
            "timestamp": data.get("simulation_time", _now_iso()),
            "details": {
                "method": sim.get("method", "unknown"),
                "bias_reduction_pct": _safe_float(
                    sim.get("delta", {}).get("disparity_reduction_pct") or sim.get("improvement")
                ),
            },
        })

    # AI explanation
    if data.get("results", {}).get("explanation"):
        trace.append({
            "action": "EXPLANATION_GENERATED",
            "timestamp": data.get("explain_time", _now_iso()),
            "details": {"generator": "Gemini AI Auditor"},
        })

    # Passport generated (always the last event)
    trace.append({
        "action": "PASSPORT_GENERATED",
        "timestamp": _now_iso(),
        "details": {"version": "2.0", "engine": "FairLens Governance Engine"},
    })

    return trace


# ---------------------------------------------------------------------------
# 4. Full Passport Builder
# ---------------------------------------------------------------------------

def build_fairness_passport(job_id: str, data: dict) -> dict:
    """
    Build the complete structured Fairness Passport JSON from audit data.

    Parameters
    ----------
    job_id : str
    data   : dict — entry from LOCAL_DATASTORE

    Returns
    -------
    dict — full passport conforming to the FairLens v2 schema
    """
    results = data.get("results", {})
    config = data.get("config", {})

    disparities: dict = results.get("disparities") or {}
    proxies: list = results.get("proxies") or []
    simulation: dict | None = results.get("simulation") or None
    explanation: dict = results.get("explanation") or {}

    dataset_name: str = data.get("filename", "unknown")
    target_column: str = config.get("target", "unknown")
    use_case: str = config.get("use_case", "Automated scoring (FairLens Audit)")

    # --- Model Info ---
    model_info = {
        "dataset": dataset_name,
        "use_case": use_case,
        "target": target_column,
        "created_at": _now_iso(),
    }

    # --- Fairness Summary ---
    disparity_scores = {
        attr: _safe_float(d.get("disparity_score"))
        for attr, d in disparities.items()
    }
    max_disparity = max(disparity_scores.values()) if disparity_scores else 0.0
    overall_accuracy = _safe_float(results.get("base_metrics", {}).get("accuracy"))
    affected_groups = [attr for attr, score in disparity_scores.items() if score > 0.1]

    fairness_summary = {
        "key_metrics": {
            "overall_accuracy": round(overall_accuracy, 4),
            "max_disparity_score": round(max_disparity, 4),
            "disparate_impact_ratio": round(max(0.0, 1.0 - max_disparity), 4),
            "affected_group_count": len(affected_groups),
        },
        "affected_groups": affected_groups,
        "disparity_by_attribute": disparity_scores,
    }

    # --- Proxy Risks ---
    formatted_proxies = []
    for p in proxies:
        formatted_proxies.append({
            "feature": p.get("proxy_feature") or p.get("feature") or "unknown",
            "proxy_for": p.get("protected_attribute") or p.get("max_protected") or "unknown",
            "correlation_score": round(_safe_float(p.get("correlation_score") or p.get("score")), 4),
            "risk_level": p.get("severity") or p.get("risk_level") or "Medium",
        })

    # --- Mitigation ---
    if simulation:
        delta = simulation.get("delta", {})
        bias_reduction = _safe_float(delta.get("disparity_reduction_pct") or simulation.get("improvement"))
        accuracy_tradeoff = _safe_float(delta.get("accuracy_change_pct") or simulation.get("accuracy_tradeoff"))
        methods = [f"Method: {simulation.get('method', 'optimization')}"]
        impact_summary = (
            f"Simulation achieved {bias_reduction:.1f}% bias reduction "
            f"with {abs(accuracy_tradeoff):.1f}% accuracy {'loss' if accuracy_tradeoff < 0 else 'gain'}."
        )
    else:
        bias_reduction = 0.0
        accuracy_tradeoff = 0.0
        methods = []
        impact_summary = "No mitigation simulation has been run."

    mitigation = {
        "methods_applied": methods,
        "bias_reduction_pct": round(bias_reduction, 2),
        "accuracy_tradeoff_pct": round(accuracy_tradeoff, 2),
        "impact_summary": impact_summary,
    }

    # --- Risk Assessment ---
    risk_assessment = compute_risk_assessment(disparities, proxies)

    # --- Decision ---
    decision = generate_decision(risk_assessment, disparities, proxies, simulation)

    # --- Audit Trace ---
    audit_trace = {
        "steps": [e["action"] for e in build_audit_trace(data)],
        "timestamped_events": build_audit_trace(data),
    }

    # --- AI Insights ---
    ai_insights = explanation.get("summary") or "No AI insights generated for this audit."

    # --- Regulatory Compliance ---
    regulatory = compute_regulatory_compliance(
        use_case=config.get("use_case", "Other"),
        disparities=disparities,
        proxies=proxies,
    )

    # --- Assemble Passport ---
    passport = {
        "job_id": job_id,
        "schema_version": "2.1",
        "model_info": model_info,
        "fairness_summary": fairness_summary,
        "proxy_risks": formatted_proxies,
        "mitigation": mitigation,
        "risk_assessment": risk_assessment,
        "regulatory_compliance": regulatory,
        "decision": decision,
        "audit_trace": audit_trace,
        "ai_insights": ai_insights,
    }

    return passport


# ---------------------------------------------------------------------------
# Legacy: generate_audit_receipt (kept for backward compatibility)
# ---------------------------------------------------------------------------

def generate_audit_receipt(
    job_id: str,
    filename: str,
    target_column: str,
    protected_attributes: list,
    disparities: dict,
    proxies: list,
) -> dict:
    """Generates a tamper-evident audit receipt (SHA-256 signed)."""
    timestamp = _now_iso()

    risk = compute_risk_assessment(disparities, proxies)
    dec = generate_decision(risk, disparities, proxies, None)

    payload = {
        "job_id": job_id,
        "timestamp": timestamp,
        "dataset_name": filename,
        "target_column": target_column,
        "protected_attributes_scanned": protected_attributes,
        "disparity_summary": {attr: _safe_float(d.get("disparity_score")) for attr, d in disparities.items()},
        "proxy_risks_found": len(proxies),
        "risk_level": risk["risk_level"],
        "risk_score": risk["risk_score"],
        "decision": dec["status"],
        "reason": dec["reason"],
        "status": "COMPLETED",
    }

    payload_str = json.dumps(payload, sort_keys=True)
    receipt_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    return {
        "receipt": payload,
        "signature_hash": receipt_hash,
        "algorithm": "SHA-256",
    }


# ---------------------------------------------------------------------------
# Legacy: generate_fairness_passport (Markdown - kept for compatibility)
# ---------------------------------------------------------------------------

def generate_fairness_passport(
    job_id: str,
    filename: str,
    target_column: str,
    protected_attributes: list,
    disparities: dict,
    proxies: list,
    explanation: dict | None,
    receipt_hash: str,
    simulation: dict | None = None,
) -> str:
    """Generates a Markdown document for compliance teams (legacy)."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    risk = compute_risk_assessment(disparities, proxies)
    dec = generate_decision(risk, disparities, proxies, simulation)

    md = f"""# Fairness Passport (FairLens Studio v2)
**Deployment Decision:** `{dec['status']}`
**Reason:** {dec['reason']}
**Overall Risk Level:** `{risk['risk_level']}` (Score: {risk['risk_score']})
**Confidence:** {dec['confidence'] * 100:.1f}%
**Audit Job ID:** `{job_id}`
**Timestamp:** `{timestamp}`
**Target System/Dataset:** `{filename}`
**Outcome Variable:** `{target_column}`
**Receipt Signature (SHA-256):** `{receipt_hash}`

---

## 1. Executive Summary
{dec.get('summary', 'No summary available.')}

### AI Auditor Insight
{explanation.get('summary', 'No AI summary available.') if explanation else 'No AI Inspector summary.'}

---

## 2. Protected Attribute Disparity Risk
"""
    for attr, data in disparities.items():
        md += f"### {attr.capitalize()} (Risk: {data.get('risk_level', 'N/A')})\n"
        md += f"- **Max Disparity Difference:** {_safe_float(data.get('disparity_score')):.3f}\n"
        md += "- **Subgroup Breakdown:**\n"
        for sg in (data.get("subgroups") or []):
            if sg:
                md += f"  - {sg.get('subgroup', 'N/A')}: {_safe_float(sg.get('selection_rate')):.2%} selection rate\n"
        md += "\n"

    md += "## 3. Proxy Bias Detection\n"
    if proxies:
        md += "The following features were identified as potential proxies for protected traits:\n"
        for px in proxies:
            feat = px.get("proxy_feature") or px.get("feature", "unknown")
            prot = px.get("protected_attribute") or px.get("max_protected", "unknown")
            md += f"- **{feat}** → **{prot}** (Severity: {px.get('severity', 'N/A')}, Score: {_safe_float(px.get('correlation_score') or px.get('score')):.3f})\n"
    else:
        md += "No high-risk proxy variables detected.\n"

    if simulation:
        delta = simulation.get("delta", {})
        md += f"""
---

## 4. Bias Mitigation Simulation
- **Method:** {simulation.get('method', 'N/A')}
- **Bias Reduction:** {_safe_float(delta.get('disparity_reduction_pct') or simulation.get('improvement')):.1f}%
- **Accuracy Tradeoff:** {_safe_float(delta.get('accuracy_change_pct') or simulation.get('accuracy_tradeoff')):.1f}%
"""

    if explanation and explanation.get("recommendations"):
        md += "\n## 5. Technical Recommendations\n"
        for rec in explanation["recommendations"]:
            md += f"- {rec}\n"

    md += """
---
*Generated by FairLens Studio Engine v2. This passport is a point-in-time compliance artifact.*
"""
    return md
