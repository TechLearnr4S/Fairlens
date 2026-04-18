import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, confusion_matrix
import logging

logger = logging.getLogger(__name__)

# In-memory cache for trained models: { job_id: {"pipeline": Pipeline, "X": DataFrame, "y": Series} }
MODEL_CACHE = {}

def build_pipeline(X: pd.DataFrame) -> Pipeline:
    """Builds a consistent sklearn pipeline for preprocessing and modeling."""
    numeric_features = X.select_dtypes(include=['int64', 'float64']).columns.tolist()
    categorical_features = X.select_dtypes(include=['object', 'category', 'bool']).columns.tolist()

    transformers = []
    
    if numeric_features:
        numeric_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        transformers.append(('num', numeric_transformer, numeric_features))
        
    if categorical_features:
        categorical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        ])
        transformers.append(('cat', categorical_transformer, categorical_features))

    preprocessor = ColumnTransformer(transformers=transformers, remainder='passthrough')

    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', LogisticRegression(max_iter=1000, random_state=42))
    ])
    
    return pipeline

def calculate_metrics(y_true, y_pred, protected_attr_series):
    accuracy = accuracy_score(y_true, y_pred)
    
    # Confusion matrix metrics
    try:
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    except ValueError:
        fpr = 0.0
        fnr = 0.0
        
    selection_rate = sum(y_pred) / len(y_pred) if len(y_pred) > 0 else 0.0
    
    df_eval = pd.DataFrame({'y_pred': y_pred, 'protected_attr': list(protected_attr_series)})
    subgroup_rates = df_eval.groupby('protected_attr')['y_pred'].mean()
    
    # Disparity as max group gap
    if len(subgroup_rates) > 1:
        disparity = float(subgroup_rates.max() - subgroup_rates.min())
        groups = subgroup_rates.to_dict()
    else:
        disparity = 0.0
        groups = {str(k): float(v) for k, v in subgroup_rates.items()} if not subgroup_rates.empty else {}
        
    return {
        "selection_rate": float(selection_rate),
        "accuracy": float(accuracy),
        "false_positive_rate": float(fpr),
        "false_negative_rate": float(fnr),
        "disparity": float(disparity),
        "groups": groups
    }

def calculate_confidence(df_len, groups_count, disparity):
    """Heuristic confidence score based on data density and consistency."""
    # Base confidence on size
    size_score = min(df_len / 1000, 1.0) * 0.5
    # Consistency across groups
    group_score = min(groups_count / 2, 1.0) * 0.3
    # Magnitude of disparity (lower disparity often more stable to simulate)
    stability_score = (1 - disparity) * 0.2
    
    return round(float(size_score + group_score + stability_score), 2)

def generate_insight(before, after, method, feature=None):
    """Generates rule-based insights about the simulation results."""
    disp_reduction = (before["disparity"] - after["disparity"]) / before["disparity"] if before["disparity"] > 0 else 0
    acc_change = (after["accuracy"] - before["accuracy"])
    
    if method == "threshold_adjustment":
        base = f"Adjusting the threshold reduced bias by {disp_reduction*100:.1f}%"
    else:
        base = f"Removing '{feature}' reduced bias by {disp_reduction*100:.1f}%"
        
    if acc_change < -0.05:
        tradeoff = f" but caused a significant {abs(acc_change)*100:.1f}% drop in accuracy."
    elif acc_change < 0:
        tradeoff = f" with a minor {abs(acc_change)*100:.1f}% accuracy trade-off."
    else:
        tradeoff = " while maintaining or improving overall accuracy."
        
    return base + tradeoff

def simulate_mitigation_enhanced(job_id: str, df: pd.DataFrame, target_col: str, protected_attrs: list, method: str, params: dict) -> dict:
    """
    Enhanced simulation engine with caching, rule-based insights, and advanced metrics.
    """
    try:
        y = df[target_col]
        # Ensure binary target
        if not pd.api.types.is_numeric_dtype(y):
            top_class = y.mode()[0]
            y = (y == top_class).astype(int)
        
        X = df.drop(columns=[target_col])
        protected_col = protected_attrs[0] if protected_attrs else None
        protected_attr_series = df[protected_col] if protected_col else pd.Series([1]*len(df))

        # Check Cache
        if job_id not in MODEL_CACHE:
            logger.info(f"Training baseline model for job {job_id}")
            pipeline = build_pipeline(X)
            pipeline.fit(X, y)
            MODEL_CACHE[job_id] = {"pipeline": pipeline, "X": X, "y": y}
        
        cache = MODEL_CACHE[job_id]
        baseline_pipeline = cache["pipeline"]
        
        # Calculate 'Before' metrics
        baseline_preds = baseline_pipeline.predict(X)
        before_metrics = calculate_metrics(y, baseline_preds, protected_attr_series)
        
        if method == "threshold_adjustment":
            threshold = params.get("threshold", 0.5)
            probas = baseline_pipeline.predict_proba(X)[:, 1]
            new_predictions = (probas >= threshold).astype(int)
            after_metrics = calculate_metrics(y, new_predictions, protected_attr_series)
            feature_used = None
            
        elif method == "feature_removal":
            feature_to_remove = params.get("feature")
            if not feature_to_remove or feature_to_remove not in X.columns:
                raise ValueError(f"Feature '{feature_to_remove}' not found for removal")
            
            # For feature removal, we must retrain
            X_mod = X.drop(columns=[feature_to_remove])
            mod_pipeline = build_pipeline(X_mod)
            mod_pipeline.fit(X_mod, y)
            new_predictions = mod_pipeline.predict(X_mod)
            after_metrics = calculate_metrics(y, new_predictions, protected_attr_series)
            feature_used = feature_to_remove
            
        else:
            raise ValueError(f"Unknown simulation method: {method}")

        # Delta metrics
        delta = {
            "disparity_reduction_pct": round(((before_metrics["disparity"] - after_metrics["disparity"]) / before_metrics["disparity"] * 100), 1) if before_metrics["disparity"] > 0 else 0,
            "accuracy_change_pct": round(((after_metrics["accuracy"] - before_metrics["accuracy"]) * 100), 1)
        }

        return {
            "method": method,
            "before": before_metrics,
            "after": after_metrics,
            "delta": delta,
            "insight": generate_insight(before_metrics, after_metrics, method, feature_used),
            "confidence": calculate_confidence(len(df), len(before_metrics["groups"]), before_metrics["disparity"])
        }

    except Exception as e:
        logger.error(f"Enhanced simulation failed: {str(e)}")
        return {
            "error": str(e),
            "status": "failed"
        }
