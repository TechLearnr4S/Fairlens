"""Helpers for extrapolating affected population and mitigation scale from disparity inputs."""

from __future__ import annotations


def clamp01(val: float) -> float:
    return max(0.0, min(1.0, val))


def compute_impact_metrics(
    total_rows: float,
    subgroup_size: float,
    disparity_gap: float,
) -> tuple[int, int, int]:
    """
    affected = subgroup size (rounded)
    improved = affected * disparity_gap (rounded)

    Returns:
        (dataset_size_rounded, affected_rounded, improved_rounded)

    disparity_gap is expected in [0, 1]; values in (1, 100] are treated as percentage / 100.
    """
    try:
        tr = float(total_rows)
        ss = float(subgroup_size)
        gap = float(disparity_gap)
    except (TypeError, ValueError):
        return 0, 0, 0

    if 1 < gap <= 100:
        gap /= 100.0
    gap = clamp01(gap)

    dataset_size = max(0, int(round(tr)))
    affected = max(0, int(round(ss)))
    improved = max(0, int(round(affected * gap)))

    return dataset_size, affected, improved


# Backwards-compatible name
def compute_subgroup_impact(
    total_rows: float,
    subgroup_size: float,
    disparity_gap: float,
) -> tuple[int, int]:
    _ds, affected, improved = compute_impact_metrics(total_rows, subgroup_size, disparity_gap)
    return affected, improved
