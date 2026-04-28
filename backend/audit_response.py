"""
audit_response.py
==================
Single assembly point for deterministic audit payloads used by `/audits/{id}/run`
and exporters. No LLM calls here; `ai_insight` is passed through when supplied.
"""

from __future__ import annotations

from typing import Any, Mapping

from governance import evaluate_regulatory_risk, compute_regulatory_compliance
from verdict_builder import build_verdict

# Stable iteration order — only keys present on disparity rows are evaluated.
AUDIT_METRIC_KEYS: tuple[str, ...] = (
    "disparity_score",
    "disparate_impact_ratio",
    "tpr_gap",
    "fpr_gap",
    "fnr_gap",
    "fpr_disparity",
    "fnr_disparity",
)


def _sorted_disparity_records(disparities: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Deterministic list view (sorted by attribute key) for APIs that require arrays."""
    out: list[dict[str, Any]] = []
    for attr in sorted(disparities.keys()):
        row = disparities[attr]
        if isinstance(row, Mapping):
            flat = dict(row)
            flat["attribute"] = attr
            out.append(flat)
    return out


def _violations_aggregate(
    *,
    compliance: Mapping[str, Any],
    evaluations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Merge canonical framework violations with per-metric evaluation flags.
    Dedup on (attribute, metric, violation, rounded value).
    """
    seen: set[tuple[Any, ...]] = set()
    rows: list[dict[str, Any]] = []

    for v in compliance.get("violations") or []:
        if not isinstance(v, Mapping):
            continue
        key = (
            v.get("attribute"),
            v.get("metric"),
            round(float(v.get("value", 0) or 0), 6),
            "framework_primary",
        )
        if key in seen:
            continue
        seen.add(key)
        rows.append(dict(v, kind="framework_primary"))

    for e in evaluations:
        if not e.get("violation"):
            continue
        key = (
            e.get("attribute"),
            e.get("metric"),
            round(float(e.get("value", 0) or 0), 6),
            "metric_evaluation",
        )
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "kind": "metric_evaluation",
            "attribute": e.get("attribute"),
            "metric": e.get("metric"),
            "value": e.get("value"),
            "threshold": e.get("threshold"),
            "severity": e.get("severity"),
            "law": e.get("law"),
            "explanation": e.get("explanation"),
            "remediation": e.get("remediation"),
        })

    rows.sort(key=lambda x: (
        str(x.get("attribute") or ""),
        str(x.get("metric") or ""),
        str(x.get("kind") or ""),
    ))
    return rows


def build_final_audit_response(
    *,
    job_id: str,
    use_case: str,
    target_column: str,
    protected_attributes: list[str],
    n_rows: int,
    filename: str | None,
    disparities: Mapping[str, Any],
    proxies: list[dict[str, Any]],
    mitigation: Any | None = None,
    ai_insight: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Assemble a single deterministic audit artifact.

    Steps (ordered, reproducible):

    1. For each (attribute × known metric slot) observed in disparity rows, call
       :func:`evaluate_regulatory_risk` once per populated metric.
    2. Aggregate violations from :func:`compute_regulatory_compliance` (primary metric)
       and from per-metric evaluations where ``violation`` is true.
    3. Invoke :func:`build_verdict` with disparity map, aggregated regulatory context,
       proxy list, and mitigation cues.
    4. Return one JSON‑serializable dict with stable key order (Python 3.7+ insertion order).

    Parameters
    ----------
    mitigation :
        Stored remediation hints (typically ``remediation_steps`` from compliance).

    ai_insight :
        Structured LLM output from the calling layer — pass ``None`` when unavailable.
    """

    compliance = compute_regulatory_compliance(use_case, dict(disparities), proxies)

    evaluations: list[dict[str, Any]] = []
    for attr in sorted(disparities.keys()):
        row = disparities[attr]
        if not isinstance(row, Mapping):
            continue
        for mk in AUDIT_METRIC_KEYS:
            raw = row.get(mk)
            if raw is None:
                continue
            try:
                val = float(raw)
            except (TypeError, ValueError):
                continue
            ev = evaluate_regulatory_risk(mk, val, use_case)
            evaluations.append({
                "attribute": attr,
                "metric": ev["metric"],
                "value": ev["value"],
                "threshold": ev["threshold"],
                "violation": ev["violation"],
                "severity": ev["severity"],
                "law": ev["law"],
                "explanation": ev["explanation"],
                "remediation": ev["remediation"],
            })

    evaluations.sort(key=lambda r: (r["attribute"], r["metric"]))
    violations = _violations_aggregate(compliance=compliance, evaluations=evaluations)

    audit_results_bundle: dict[str, Any] = {
        "disparities": dict(disparities),
        "regulatory_findings": {
            **compliance,
            "per_metric_evaluations": evaluations,
            "aggregated_violations": violations,
        },
        "proxy_risks": proxies,
        "mitigation_suggestions": mitigation
        if mitigation is not None
        else (compliance.get("remediation_steps") or []),
        "dataset": {"n_rows": int(n_rows), "job_id": job_id, "filename": filename},
        "metadata": {"n_rows": int(n_rows)},
    }

    verdict = build_verdict(audit_results_bundle)

    summary = {
        "job_id": job_id,
        "use_case": use_case,
        "target_column": target_column,
        "protected_attributes": sorted(str(x) for x in protected_attributes),
        "n_rows": int(n_rows),
        "filename": filename,
        "attributes_scanned": len(disparities),
        "proxies_flagged": len(proxies),
        "primary_compliance_status": compliance.get("status"),
        "violations_count": len(violations),
        "metric_evaluations_count": len(evaluations),
        "deterministic_revision": "1",
    }

    return {
        "summary": summary,
        "disparities": _sorted_disparity_records(disparities),
        "proxies": list(proxies),
        "regulatory": violations,
        "verdict": verdict,
        "ai_insight": ai_insight if ai_insight is not None else {},
    }
