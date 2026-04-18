"""
fairness_engine.py
==================
Vectorized disparity computation for FairLens Studio.
"""

from __future__ import annotations
import logging
import pandas as pd

logger = logging.getLogger(__name__)


def compute_disparities(
    df: pd.DataFrame,
    target_col: str,
    protected_attrs: list[str],
) -> dict:
    """
    Compute demographic parity disparity for each protected attribute.

    Uses fully vectorised pandas groupby — no Python-level loops over rows.
    Returns a dict keyed by attribute name with disparity score, risk level,
    warning flag, and per-subgroup breakdown.
    """
    results: dict = {}

    # --- Binarise target if needed ---
    if not pd.api.types.is_numeric_dtype(df[target_col]):
        top_class = df[target_col].mode().iloc[0]
        y = (df[target_col] == top_class).astype(int)
    else:
        y = pd.to_numeric(df[target_col], errors="coerce").fillna(0)

    # Attach y to a working copy for vectorised groupby
    work = df[protected_attrs].copy()
    work["__y__"] = y.values

    for attr in protected_attrs:
        if attr not in df.columns:
            logger.warning("Protected attribute '%s' not found — skipping.", attr)
            continue

        try:
            # Fully vectorised: one groupby + agg call
            grp = (
                work.groupby(attr)["__y__"]
                .agg(selection_rate="mean", count="count")
                .reset_index()
                .rename(columns={attr: "subgroup"})
            )
            grp["subgroup"] = grp["subgroup"].astype(str)
            grp["selection_rate"] = grp["selection_rate"].round(4)

            # Disparity = max - min selection rate (Demographic Parity Difference)
            max_rate = float(grp["selection_rate"].max())
            min_rate = float(grp["selection_rate"].min())
            dp_diff = round(min(max(max_rate - min_rate, 0.0), 1.0), 4)

            risk_level = (
                "High"   if dp_diff > 0.2 else
                "Medium" if dp_diff > 0.1 else
                "Low"
            )
            warning = (
                f"Disparity of {dp_diff:.1%} detected between subgroups of '{attr}'. "
                "This exceeds the 20% threshold."
                if dp_diff > 0.2 else None
            )

            # FPR / FNR proxies (selection-rate based)
            fpr_disp = round(abs(grp["selection_rate"].std()), 4) if len(grp) > 1 else 0.0
            fnr_disp = round(1.0 - max_rate, 4)

            results[attr] = {
                "disparity_score": dp_diff,
                "risk_level":      risk_level,
                "warning":         warning,
                "fpr_disparity":   fpr_disp,
                "fnr_disparity":   fnr_disp,
                "subgroups":       grp.to_dict(orient="records"),
            }
            logger.info("Disparity computed | attr=%s score=%.4f risk=%s", attr, dp_diff, risk_level)

        except Exception as exc:
            logger.error("Failed to compute disparity for '%s': %s", attr, exc)
            results[attr] = {
                "disparity_score": 0.0,
                "risk_level": "Unknown",
                "warning": f"Computation failed: {exc}",
                "fpr_disparity": 0.0,
                "fnr_disparity": 0.0,
                "subgroups": [],
            }

    return results
