"""
correlation_engine.py
=====================
Core Correlation Analysis Engine for FairLens Studio — Proxy Bias Hunter.

Computes the statistical relationship between each feature in a dataset
and a set of user-specified protected attributes, then ranks features by
their proxy-bias risk.

Exported public API
-------------------
run_correlation_analysis(df, protected_attrs, target_col) -> dict
    Returns a nested dict keyed by
    (protected_attribute -> {feature_name -> result_dict}).

compute_proxy_risk(correlation_results) -> list[dict]
    Aggregates correlation scores across protected attributes into a ranked
    proxy-risk list with risk levels and is_proxy flags.

Internal helpers (modular, individually testable)
-------------------------------------------------
detect_feature_types(df, exclude_cols)
compute_numeric_corr(series, target_series)
compute_categorical_corr(series, target_series)
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.feature_selection import mutual_info_classif
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum rows sampled before heavy computation to keep latency acceptable
_SAMPLE_LIMIT = 10_000

# Minimum unique values for a numeric column to be treated as continuous
_NUMERIC_UNIQUE_THRESHOLD = 10


# ---------------------------------------------------------------------------
# Public Entry Point
# ---------------------------------------------------------------------------


def run_correlation_analysis(
    df: pd.DataFrame,
    protected_attrs: list[str],
    target_col: str | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Compute per-feature correlation scores against every protected attribute.

    Parameters
    ----------
    df : pd.DataFrame
        The full dataset (already loaded from the uploaded CSV).
    protected_attrs : list[str]
        Column names that represent protected / sensitive attributes
        (e.g. ["gender", "race"]).
    target_col : str | None
        The prediction-target column to exclude from analysis.

    Returns
    -------
    dict
        Nested mapping:
        ``{protected_attr: {feature: {type, correlation_score, method}}}``
    """
    if not isinstance(df, pd.DataFrame) or df.empty:
        raise ValueError("df must be a non-empty pandas DataFrame.")

    # --- 1. Identify columns to exclude from feature space -----------------
    exclude = set(protected_attrs)
    if target_col:
        exclude.add(target_col)

    feature_cols = [c for c in df.columns if c not in exclude]

    if not feature_cols:
        raise ValueError("No feature columns remain after excluding protected/target columns.")

    # --- 2. Detect feature types for the remaining columns -----------------
    type_map = detect_feature_types(df, exclude_cols=list(exclude))

    # --- 3. Sample for performance on large datasets -----------------------
    work_df = df if len(df) <= _SAMPLE_LIMIT else df.sample(_SAMPLE_LIMIT, random_state=42)

    # --- 4. Impute missing values (simple strategy) ------------------------
    work_df = _impute(work_df)

    # --- 5. Compute correlations for each protected attribute --------------
    results: dict[str, dict[str, Any]] = {}

    for p_attr in protected_attrs:
        if p_attr not in work_df.columns:
            logger.warning("Protected attribute '%s' not found in DataFrame — skipping.", p_attr)
            continue

        p_series = work_df[p_attr]
        attr_results: dict[str, Any] = {}

        for feat in feature_cols:
            feat_series = work_df[feat]
            feat_type = type_map.get(feat, "categorical")

            try:
                if feat_type == "numerical":
                    score, method = compute_numeric_corr(feat_series, p_series)
                else:
                    score, method = compute_categorical_corr(feat_series, p_series)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Could not compute correlation for feature '%s' vs '%s': %s",
                    feat, p_attr, exc,
                )
                score, method = 0.0, "error"

            attr_results[feat] = {
                "type": feat_type,
                "correlation_score": round(float(score), 4),
                "method": method,
            }

        results[p_attr] = attr_results

    return results


# ---------------------------------------------------------------------------
# Proxy Risk Scoring
# ---------------------------------------------------------------------------


# Risk-level thresholds
_RISK_THRESHOLDS: list[tuple[float, str]] = [
    (0.5, "High"),
    (0.2, "Medium"),
    (0.0, "Low"),
]

# A feature is flagged as a potential proxy when its score exceeds this value
_PROXY_FLAG_THRESHOLD = 0.3


def compute_proxy_risk(
    correlation_results: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Rank every feature by how strongly it proxies *any* protected attribute.

    For each feature the score is the **maximum** correlation across all
    protected attributes, so a feature that is highly correlated with even
    one sensitive column is surfaced.

    Parameters
    ----------
    correlation_results : dict
        Output of ``run_correlation_analysis`` — the nested mapping
        ``{protected_attr: {feature: {type, correlation_score, method}}}``.

    Returns
    -------
    list[dict]
        Sorted (descending by score) list of dicts::

            [
                {
                    "feature":          str,
                    "score":            float,   # max over all protected attrs
                    "risk_level":       "High" | "Medium" | "Low",
                    "is_proxy":         bool,    # True when score > 0.3
                    "type":             "numerical" | "categorical",
                    "method":           str,     # method used for the max score
                    "max_protected":    str,     # which protected attr gave the max
                },
                ...
            ]
    """
    if not correlation_results:
        return []

    # --- 1. Collect the max score per feature across all protected attrs ----
    feature_agg: dict[str, dict[str, Any]] = {}

    for p_attr, features in correlation_results.items():
        for feat, info in features.items():
            score = info.get("correlation_score", 0.0)
            prev = feature_agg.get(feat)

            if prev is None or score > prev["score"]:
                feature_agg[feat] = {
                    "feature": feat,
                    "score": round(float(score), 4),
                    "type": info.get("type", "unknown"),
                    "method": info.get("method", "unknown"),
                    "max_protected": p_attr,
                }

    # --- 2. Attach risk level + is_proxy flag ------------------------------
    ranked: list[dict[str, Any]] = []
    for entry in feature_agg.values():
        entry["risk_level"] = _classify_risk(entry["score"])
        entry["is_proxy"] = entry["score"] > _PROXY_FLAG_THRESHOLD
        ranked.append(entry)

    # --- 3. Sort descending by score ---------------------------------------
    ranked.sort(key=lambda r: r["score"], reverse=True)

    return ranked


def compute_numeric_feature_correlation_matrix(
    df: pd.DataFrame,
    *,
    excluded: set[str] | None = None,
) -> dict[str, Any]:
    """
    Pairwise Pearson correlation matrix among **numeric** feature columns only.

    Excludes protected columns, target column, etc. Caller passes ``excluded``.
    Rows with insufficient variance yield NaNs in pandas; emitted as JSON null.

    Returns
    -------
    dict
        ``{"columns": [str, ...], "matrix": [[float | null, ...], ...], "method": "pearson"}``
    """
    exclude = set(excluded or ())
    feats = [c for c in df.columns if c not in exclude]

    if not feats:
        return {"columns": [], "matrix": [], "method": "pearson"}

    work_df = df[feats].copy()
    if len(work_df) > _SAMPLE_LIMIT:
        work_df = work_df.sample(_SAMPLE_LIMIT, random_state=42)
    work_df = _impute(work_df)

    numeric_cols = []
    for c in feats:
        if not pd.api.types.is_numeric_dtype(work_df[c].dtype):
            continue
        nz = work_df[c].dropna()
        # Need at least two finite points and nonzero variance for meaningful r
        if len(nz) < 2 or float(nz.std()) == 0.0:
            continue
        numeric_cols.append(c)

    if len(numeric_cols) < 2:
        return {"columns": numeric_cols, "matrix": [], "method": "pearson"}

    sub = work_df[numeric_cols]
    cm = sub.corr(method="pearson")

    cols = [str(x) for x in cm.columns.tolist()]

    def _cell(v: Any) -> float | None:
        if pd.isna(v):
            return None
        return round(float(v), 6)

    matrix: list[list[float | None]] = []
    for _, row in cm.iterrows():
        matrix.append([_cell(row[c]) for c in cm.columns])

    return {"columns": cols, "matrix": matrix, "method": "pearson"}


def _classify_risk(score: float) -> str:
    """Map a normalised [0, 1] score to a human-readable risk label."""
    for threshold, label in _RISK_THRESHOLDS:
        if score >= threshold:
            return label
    return "Low"


# ---------------------------------------------------------------------------
# Modular Helper Functions
# ---------------------------------------------------------------------------


def detect_feature_types(
    df: pd.DataFrame,
    exclude_cols: list[str] | None = None,
) -> dict[str, str]:
    """
    Classify every non-excluded column as ``"numerical"`` or ``"categorical"``.

    A column is treated as **numerical** when:
    * Its pandas dtype is numeric (int / float), AND
    * It has at least ``_NUMERIC_UNIQUE_THRESHOLD`` unique values (to avoid
      treating binary flags and Boolean-ish ints as continuous numbers).

    Everything else (object, category, bool, or low-cardinality int) is
    treated as **categorical**.

    Parameters
    ----------
    df : pd.DataFrame
    exclude_cols : list[str] | None
        Columns to skip (protected attributes + target column).

    Returns
    -------
    dict[str, str]
        ``{"column_name": "numerical" | "categorical"}``
    """
    exclude = set(exclude_cols or [])
    type_map: dict[str, str] = {}

    for col in df.columns:
        if col in exclude:
            continue

        col_dtype = df[col].dtype
        n_unique = df[col].nunique(dropna=True)

        if pd.api.types.is_bool_dtype(col_dtype):
            kind = "categorical"
        elif pd.api.types.is_numeric_dtype(col_dtype) and n_unique >= _NUMERIC_UNIQUE_THRESHOLD:
            kind = "numerical"
        else:
            kind = "categorical"

        type_map[col] = kind

    return type_map


def compute_numeric_corr(
    series: pd.Series,
    target_series: pd.Series,
) -> tuple[float, str]:
    """
    Compute the absolute Pearson correlation between a numerical feature and
    the protected attribute (which may itself be numerical or encoded).

    The protected attribute is label-encoded when it is categorical so that
    Pearson can still be applied — the magnitude is what matters here, not
    the direction, which is why we take ``abs(r)``.

    Parameters
    ----------
    series : pd.Series
        Numerical feature column.
    target_series : pd.Series
        Protected-attribute column (any dtype).

    Returns
    -------
    (score, method) : (float, str)
        ``score`` is normalised to [0, 1].  ``method`` is ``"pearson"``.
    """
    x = series.astype(float)
    y = _encode_if_categorical(target_series)

    # Drop any remaining NaNs (should be minimal after imputation)
    mask = (~np.isnan(x)) & (~np.isnan(y))
    x, y = x[mask], y[mask]

    if len(x) < 2 or x.std() == 0 or y.std() == 0:
        return 0.0, "pearson"

    r, _ = stats.pearsonr(x, y)
    # Pearson r ∈ [-1, 1] — normalise to [0, 1] via abs
    score = float(np.clip(abs(r), 0.0, 1.0))
    return score, "pearson"


def compute_categorical_corr(
    series: pd.Series,
    target_series: pd.Series,
) -> tuple[float, str]:
    """
    Compute the association between a categorical (or low-cardinality) feature
    and the protected attribute using **Mutual Information** (preferred) with a
    chi-square fallback.

    Mutual Information is favoured because it captures non-linear dependencies
    and does not assume a particular distribution. The raw MI score is
    normalised to [0, 1] using the theoretical maximum (joint entropy bound).

    Parameters
    ----------
    series : pd.Series
        Categorical feature column.
    target_series : pd.Series
        Protected-attribute column.

    Returns
    -------
    (score, method) : (float, str)
        ``score`` ∈ [0, 1].  ``method`` is ``"mi"`` or ``"chi2"``.
    """
    # Encode both sides to integer codes
    x_enc = _encode_if_categorical(series).reshape(-1, 1)
    y_enc = _encode_if_categorical(target_series)

    n_unique_y = len(np.unique(y_enc))

    # --- Attempt Mutual Information first ----------------------------------
    try:
        if n_unique_y >= 2:
            mi_scores = mutual_info_classif(
                x_enc,
                y_enc,
                discrete_features=True,
                random_state=42,
            )
            raw_mi = float(mi_scores[0])

            # Normalise: MI ≤ min(H(X), H(Y)); we bound by log2(n_classes)
            max_mi = float(np.log2(max(n_unique_y, 2)))
            score = float(np.clip(raw_mi / max_mi, 0.0, 1.0)) if max_mi > 0 else 0.0
            return score, "mi"
    except Exception as exc:  # noqa: BLE001
        logger.debug("MI computation failed (%s); falling back to chi2.", exc)

    # --- Chi-square fallback -----------------------------------------------
    try:
        contingency = pd.crosstab(series.astype(str), target_series.astype(str))
        chi2, p_val, dof, _ = stats.chi2_contingency(contingency)

        # Convert chi2 to Cramér's V which lives in [0, 1]
        n = contingency.sum().sum()
        k = min(contingency.shape) - 1
        cramers_v = float(np.sqrt(chi2 / (n * max(k, 1)))) if n > 0 else 0.0
        score = float(np.clip(cramers_v, 0.0, 1.0))
        return score, "chi2"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chi2 computation also failed: %s", exc)
        return 0.0, "chi2"


# ---------------------------------------------------------------------------
# Private Utilities
# ---------------------------------------------------------------------------


def _encode_if_categorical(series: pd.Series) -> np.ndarray:
    """
    Label-encode a column if it is non-numeric; cast numeric columns to float.
    Always returns a 1-D float numpy array.
    """
    if pd.api.types.is_numeric_dtype(series.dtype):
        return series.astype(float).values

    le = LabelEncoder()
    encoded = le.fit_transform(series.astype(str))
    return encoded.astype(float)


def _impute(df: pd.DataFrame) -> pd.DataFrame:
    """
    Simple in-place-safe imputation:
    * Numerical columns → median fill.
    * Categorical / object columns → mode fill (falls back to "missing").
    """
    df = df.copy()
    for col in df.columns:
        if df[col].isna().any():
            if pd.api.types.is_numeric_dtype(df[col].dtype):
                df[col].fillna(df[col].median(), inplace=True)
            else:
                mode_vals = df[col].mode(dropna=True)
                fill_val = mode_vals.iloc[0] if not mode_vals.empty else "missing"
                df[col].fillna(fill_val, inplace=True)
    return df
