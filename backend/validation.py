"""
validation.py
=============
Input validation utilities for FairLens Studio API endpoints.

All validators raise ValueError with a clear message on failure,
which the endpoint converts to a 400 HTTPException.
"""

from __future__ import annotations
import logging
import pandas as pd

logger = logging.getLogger(__name__)

MAX_ROWS = 200_000
MAX_COLS = 500
MIN_ROWS = 10


def validate_dataset(df: pd.DataFrame, filename: str) -> list[str]:
    """
    Validate an uploaded DataFrame.

    Returns a list of warning strings (non-fatal).
    Raises ValueError for fatal issues.
    """
    warnings: list[str] = []

    if df.empty:
        raise ValueError("Dataset is empty.")
    if len(df) < MIN_ROWS:
        raise ValueError(f"Dataset too small ({len(df)} rows). Minimum is {MIN_ROWS}.")
    if len(df) > MAX_ROWS:
        raise ValueError(f"Dataset too large ({len(df):,} rows). Maximum is {MAX_ROWS:,}.")
    if len(df.columns) > MAX_COLS:
        raise ValueError(f"Too many columns ({len(df.columns)}). Maximum is {MAX_COLS}.")

    # Warn about high missing-value columns
    null_pct = df.isnull().mean()
    high_null = null_pct[null_pct > 0.5].index.tolist()
    if high_null:
        warnings.append(f"Columns with >50% missing values: {high_null[:5]}")

    return warnings


def validate_audit_config(
    df: pd.DataFrame,
    target_column: str,
    protected_attributes: list[str],
) -> list[str]:
    """
    Validate the audit run configuration against the uploaded DataFrame.

    Returns warnings list.
    Raises ValueError for fatal config issues.
    """
    warnings: list[str] = []
    all_cols = set(df.columns.tolist())

    # --- Target column ---
    if not target_column:
        raise ValueError("'target_column' is required.")
    if target_column not in all_cols:
        raise ValueError(
            f"Target column '{target_column}' not found. "
            f"Available columns: {sorted(all_cols)[:10]}"
        )

    target_series = df[target_column].dropna()
    if len(target_series) == 0:
        raise ValueError(f"Target column '{target_column}' is entirely null.")
    if target_series.nunique() < 2:
        raise ValueError(
            f"Target column '{target_column}' has only one unique value — "
            "cannot compute disparity."
        )
    if target_series.nunique() > 50:
        warnings.append(
            f"Target column '{target_column}' has {target_series.nunique()} unique values. "
            "For best results, use a binary (0/1) target."
        )

    # --- Protected attributes ---
    if not protected_attributes:
        raise ValueError("At least one protected attribute must be specified.")

    missing_protected = [a for a in protected_attributes if a not in all_cols]
    if missing_protected:
        raise ValueError(
            f"Protected attribute(s) not found in dataset: {missing_protected}. "
            f"Available columns: {sorted(all_cols)[:10]}"
        )

    # Warn if protected attr equals target
    overlap = [a for a in protected_attributes if a == target_column]
    if overlap:
        warnings.append(
            f"Protected attribute(s) {overlap} are the same as the target column — "
            "results may be misleading."
        )

    # Warn about high-cardinality protected attributes
    for attr in protected_attributes:
        n_unique = df[attr].nunique()
        if n_unique > 20:
            warnings.append(
                f"Protected attribute '{attr}' has {n_unique} unique values. "
                "Consider grouping into fewer categories."
            )

    return warnings


def sanitize_string(s: str, max_len: int = 256) -> str:
    """Strip whitespace and truncate a string field for safe logging."""
    if not isinstance(s, str):
        return ""
    return s.strip()[:max_len]


def safe_json_truncate(obj: dict | list, max_keys: int = 15) -> dict | list:
    """
    Truncate large dicts/lists before embedding in LLM prompts or logs.
    Prevents token overflow and log bloat.
    """
    if isinstance(obj, dict):
        keys = list(obj.keys())[:max_keys]
        return {k: obj[k] for k in keys}
    if isinstance(obj, list):
        return obj[:max_keys]
    return obj
