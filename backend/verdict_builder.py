"""
Deterministic fairness verdict aggregation (no LLM).
"""

from __future__ import annotations

import math
from typing import Any, Mapping


def _safe_float(val: Any, fallback: float = 0.0) -> float:
    try:
        return float(val) if val is not None else fallback
    except (TypeError, ValueError):
        return fallback


def _normalize_disparities(disparities: Any) -> dict[str, dict[str, Any]]:
    """Normalize to attribute -> metric dict."""
    if disparities is None:
        return {}
    if isinstance(disparities, Mapping):
        return {str(k): (v if isinstance(v, Mapping) else {}) for k, v in disparities.items()}
    if isinstance(disparities, list):
        merged: dict[str, Any] = {}
        for item in disparities:
            if not isinstance(item, Mapping):
                continue
            for k, v in item.items():
                if k not in merged:
                    merged[k] = v
                else:
                    if isinstance(v, (int, float)) and isinstance(merged[k], (int, float)):
                        merged[k] = max(float(merged[k]), float(v))
        return {"aggregate": merged} if merged else {}
    return {}


def _worst_gap_for_attribute(data: Mapping[str, Any]) -> float:
    """Single scalar in [0, 1]; higher means more unfair."""
    gaps: list[float] = []

    for key in ("disparity_score", "tpr_gap", "fpr_gap", "fnr_gap"):
        v = data.get(key)
        if v is not None:
            gaps.append(min(1.0, abs(_safe_float(v))))

    # EEOC-style: ratios below threshold imply adverse impact encoded as gap
    ratio = data.get("disparate_impact_ratio")
    if ratio is not None:
        r = _safe_float(ratio)
        if r > 0:
            gaps.append(min(1.0, max(0.0, 0.80 - min(r, 1.0)) / 0.80))

    if not gaps:
        return 0.0
    return max(gaps)


def _parity_quality(disparities: dict[str, dict[str, Any]]) -> tuple[float, float]:
    """
    Returns (parity_quality, worst_gap) in [0,1].
    parity_quality nearer 1 == fairer aggregate picture.
    """
    if not disparities:
        return 1.0, 0.0

    per_attr = [_worst_gap_for_attribute(d) for d in disparities.values()]
    worst_gap = max(per_attr) if per_attr else 0.0
    pq = max(0.0, min(1.0, 1.0 - worst_gap))
    return pq, worst_gap


def _violation_entries(regulatory_findings: Any) -> list[Any]:
    if regulatory_findings is None:
        return []
    if isinstance(regulatory_findings, Mapping):
        v = regulatory_findings.get("violations")
        if isinstance(v, list):
            return v
        return []
    if isinstance(regulatory_findings, list):
        return regulatory_findings
    return []


def _violations_boolean(regulatory_findings: Any) -> bool:
    """True when any documented regulatory violation applies."""
    if regulatory_findings is None:
        return False
    if isinstance(regulatory_findings, Mapping):
        if regulatory_findings.get("violation") is True:
            return True
        status = regulatory_findings.get("status") or regulatory_findings.get("compliance_status")
        if status in ("VIOLATION_DETECTED", "VIOLATION", "FAIL"):
            return True
        vlist = regulatory_findings.get("violations")
        if isinstance(vlist, list) and len(vlist) > 0:
            return True
        # Single-key evaluate_regulatory_risk style nested
        rf = regulatory_findings.get("regulatory_framework") or {}
        if isinstance(rf, Mapping) and rf.get("violation") is True:
            return True
    elif isinstance(regulatory_findings, list):
        return any(isinstance(x, Mapping) and x.get("violation") is True for x in regulatory_findings)
    return False


def _multiple_statutory_violations(regulatory_findings: Any) -> bool:
    entries = _violation_entries(regulatory_findings)
    if len(entries) >= 2:
        return True
    if isinstance(regulatory_findings, Mapping):
        vlist = regulatory_findings.get("violations") or regulatory_findings.get("findings")
        if isinstance(vlist, list) and len(vlist) >= 2:
            return True
    if isinstance(regulatory_findings, list) and len(regulatory_findings) >= 2:
        return True
    return False


def _proxy_severity(proxy_risks: Any) -> float:
    """Max normalized severity from proxy list in [0, 1]."""
    mapping = {"low": 0.2, "medium": 0.5, "high": 0.85, "critical": 1.0}
    if not isinstance(proxy_risks, list) or not proxy_risks:
        return 0.0
    out = 0.0
    for p in proxy_risks:
        if not isinstance(p, Mapping):
            continue
        sev = str(p.get("severity") or p.get("risk_level") or "low")
        key = sev.strip().lower()
        out = max(out, mapping.get(key, 0.35))
    return out


def _mitigation_strings(mitigation_suggestions: Any) -> list[str]:
    out: list[str] = []
    if mitigation_suggestions is None:
        return out
    if isinstance(mitigation_suggestions, str):
        return [mitigation_suggestions.strip()] if mitigation_suggestions.strip() else []
    if not isinstance(mitigation_suggestions, list):
        return out
    for m in mitigation_suggestions:
        if isinstance(m, str):
            if m.strip():
                out.append(m.strip())
        elif isinstance(m, Mapping):
            t = m.get("text") or m.get("suggestion") or m.get("title") or m.get("detail")
            if isinstance(t, str) and t.strip():
                out.append(t.strip())
    return out


def _confidence_score(
    n_rows: int,
    disparities: dict[str, dict[str, Any]],
) -> int:
    """
    Sample adequacy + cross-attribute consistency (0–100).
    Purely heuristic and deterministic.
    """
    vals = [_safe_float(d.get("disparity_score")) for d in disparities.values()]

    consistency: float
    if len(vals) >= 3:
        m = sum(vals) / len(vals)
        var = sum((x - m) ** 2 for x in vals) / len(vals)
        stdev = math.sqrt(var)
        consistency = float(max(0.0, min(1.0, 1.0 - min(1.0, stdev * 4.5))))
    elif len(vals) == 2:
        consistency = 0.88 if abs(vals[0] - vals[1]) < 0.08 else 0.72
    elif len(vals) == 1:
        consistency = 0.90
    else:
        consistency = 0.70

    n = max(0, int(n_rows))
    sample_quality = math.log1p(n) / math.log1p(10_000)  # saturates slowly
    sample_quality = max(0.0, min(1.0, sample_quality))

    raw = 0.48 * sample_quality + 0.52 * consistency
    pct = int(round(100 * raw))
    return max(0, min(100, pct))


def _recommendation(
    severity: str,
    mitigation_suggestions: Any,
    legal_positive: bool,
) -> str:
    parts: list[str] = []

    if severity == "CRITICAL":
        parts.append(
            "Pause deployment until disparities are mitigated; engage compliance review on likely violations.",
        )
    elif severity == "HIGH":
        parts.append(
            "Apply fairness mitigation and re-verify metrics before relying on automated decisions.",
        )
    elif severity == "MEDIUM":
        parts.append(
            "Continue monitoring subgroup outcomes and tighten monitoring where gaps persist.",
        )
    else:
        parts.append("Retain periodic fairness checks as part of model governance.")

    sug = _mitigation_strings(mitigation_suggestions)
    if sug:
        parts.append(f"Next step: {sug[0]}.")

    if legal_positive:
        parts.append(
            "Legal exposure assessment indicates potential regulatory concern; prioritize documented remediation.",
        )

    return " ".join(parts)


def build_verdict(audit_results: Mapping[str, Any]) -> dict[str, Any]:
    """
    Deterministic verdict assembly from audit outputs.

    Expected input keys (aliases supported):
    - disparities: list[dict] or dict
    - regulatory_results / regulatory_findings: list[dict] or dict
    - proxies / proxy_risks / proxy_risk: list[dict]
    - dataset/metadata/n_rows (optional, for confidence bands)

    Logic (as requested):
    1) Severity:
       - CRITICAL: disparity < 0.5 OR multiple violations
       - HIGH: disparity < 0.8
       - MEDIUM: moderate gap
       - LOW: minimal gap
    2) Legal exposure:
       - any violation=True -> "Violation Likely"
       - else -> "No Immediate Violation"
    3) Confidence by dataset rows:
       - >50k -> 90
       - >10k -> 80
       - else -> 70
    4) Recommendation:
       - proxy risk present -> "Remove proxy features"
       - else if disparity present -> "Apply reweighing"
       - else -> "Monitor"
    """
    disparities_raw = audit_results.get("disparities")
    regulatory_results = audit_results.get("regulatory_results")
    if regulatory_results is None:
        regulatory_results = audit_results.get("regulatory_findings")

    proxies = audit_results.get("proxies")
    if proxies is None:
        proxies = audit_results.get("proxy_risks")
    if proxies is None:
        proxies = audit_results.get("proxy_risk")

    disparities = _normalize_disparities(disparities_raw)

    # Build a "disparity ratio like" scalar in [0,1], where lower is worse.
    # Priority:
    # - disparate_impact_ratio (direct legal ratio)
    # - disparity (already ratio-like in this app)
    # - transformed disparity_score => (1 - score)
    ratio_candidates: list[float] = []
    for d in disparities.values():
        if not isinstance(d, Mapping):
            continue
        if d.get("disparate_impact_ratio") is not None:
            ratio_candidates.append(max(0.0, min(1.0, _safe_float(d.get("disparate_impact_ratio")))))
            continue
        if d.get("disparity") is not None:
            ratio_candidates.append(max(0.0, min(1.0, _safe_float(d.get("disparity")))))
            continue
        if d.get("disparity_score") is not None:
            gap = max(0.0, min(1.0, _safe_float(d.get("disparity_score"))))
            ratio_candidates.append(max(0.0, min(1.0, 1.0 - gap)))

    disparity_ratio = min(ratio_candidates) if ratio_candidates else 1.0

    legal_flag = _violations_boolean(regulatory_results)
    violations_count = 0
    if isinstance(regulatory_results, list):
        violations_count = sum(
            1 for r in regulatory_results if isinstance(r, Mapping) and r.get("violation") is True
        )
    elif isinstance(regulatory_results, Mapping):
        vlist = regulatory_results.get("violations")
        if isinstance(vlist, list):
            violations_count = sum(
                1 for r in vlist if isinstance(r, Mapping)
            )
        elif regulatory_results.get("violation") is True:
            violations_count = 1

    multiple_violations = violations_count >= 2

    if disparity_ratio < 0.5 or multiple_violations:
        severity = "CRITICAL"
    elif disparity_ratio < 0.8:
        severity = "HIGH"
    elif disparity_ratio < 0.95:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    legal_exposure = "Violation Likely" if legal_flag else "No Immediate Violation"

    ds = audit_results.get("dataset")
    md = audit_results.get("metadata")
    n_rows = 0
    if isinstance(ds, Mapping):
        n_rows = int(_safe_float(ds.get("n_rows") or ds.get("row_count") or 0))
    elif isinstance(md, Mapping):
        n_rows = int(_safe_float(md.get("n_rows") or md.get("row_count") or 0))
    else:
        n_rows = int(_safe_float(audit_results.get("n_rows")))

    if n_rows > 50_000:
        confidence = 90
    elif n_rows > 10_000:
        confidence = 80
    else:
        confidence = 70

    proxy_risk_present = isinstance(proxies, list) and len(proxies) > 0
    disparity_present = disparity_ratio < 0.95

    if proxy_risk_present:
        recommendation = "Remove proxy features"
    elif disparity_present:
        recommendation = "Apply reweighing"
    else:
        recommendation = "Monitor"

    return {
        "severity": severity,
        "legal_exposure": legal_exposure,
        "confidence": confidence,
        "recommendation": recommendation,
    }
