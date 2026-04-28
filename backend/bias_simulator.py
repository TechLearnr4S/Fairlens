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

# In-memory cache for trained models: { job_id: {"pipeline": Pipeline, "X": DataFrame, "y": Series, "probs": np.array, "before_metrics": dict, "protected_attr_series": Series} }
MODEL_CACHE = {}

# In-memory cache for specific simulation results: { (job_id, method, params_frozen): dict }
SIMULATION_CACHE = {}

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
    """Optimized metrics calculation using numpy for core statistics."""
    # Convert to numpy for faster bitwise operations
    y_true_np = np.asarray(y_true)
    y_pred_np = np.asarray(y_pred)
    
    accuracy = float(np.mean(y_true_np == y_pred_np))
    
    # Fast TP/TN/FP/FN
    tp = np.sum((y_true_np == 1) & (y_pred_np == 1))
    tn = np.sum((y_true_np == 0) & (y_pred_np == 0))
    fp = np.sum((y_true_np == 0) & (y_pred_np == 1))
    fn = np.sum((y_true_np == 1) & (y_pred_np == 0))
    
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0
    selection_rate = float(np.mean(y_pred_np))
    
    # Group-based metrics (still use pandas for its efficient grouping logic)
    # Reusing the index of protected_attr_series for speed
    y_pred_series = pd.Series(y_pred_np, index=protected_attr_series.index)
    subgroup_rates = y_pred_series.groupby(protected_attr_series).mean()
    
    # Disparity as max group gap
    if len(subgroup_rates) > 1:
        disparity = float(subgroup_rates.max() - subgroup_rates.min())
        groups = subgroup_rates.to_dict()
    else:
        disparity = 0.0
        groups = {str(k): float(v) for k, v in subgroup_rates.items()} if not subgroup_rates.empty else {}
        
    return {
        "selection_rate": selection_rate,
        "accuracy": accuracy,
        "false_positive_rate": fpr,
        "false_negative_rate": fnr,
        "disparity": disparity,
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

def generate_insight(before, after, method, threshold=0.5, feature=None):
    """Generates rule-based insights about the simulation results."""
    disp_reduction = (before["disparity"] - after["disparity"]) / before["disparity"] if before["disparity"] > 0 else 0
    acc_change = (after["accuracy"] - before["accuracy"])
    
    insights = []
    
    if method == "threshold_adjustment":
        if disp_reduction > 0.01:
            insights.append("Threshold adjustment reduced group imbalance")
        elif disp_reduction < -0.01:
            insights.append("Modified threshold increased group disparity")
            
        if acc_change < -0.01:
            if threshold > 0.5:
                insights.append("Stricter threshold reduced positive predictions")
            else:
                insights.append("Modified threshold increased false positive noise")
    elif method == "reweighing":
        if disp_reduction > 0.01:
            insights.append("Reweighing successfully balanced group representation during training")
    else:
        if disp_reduction > 0.01:
            insights.append(f"Removing '{feature}' successfully eliminated a source of proxy bias")
        
    if not insights:
        insights.append("Current parameters maintain a stable balance between fairness and accuracy")
        
    return ". ".join(insights) + "."

def simulate_mitigation_enhanced(job_id: str, df: pd.DataFrame, target_col: str, protected_attrs: list, method: str, params: dict) -> dict:
    """
    Enhanced simulation engine with multi-layer caching, rule-based insights, and optimized metrics.
    """
    try:
        # 1. Check Simulation Cache (Fastest)
        params_frozen = tuple(sorted(params.items())) if params else ()
        cache_key = (job_id, method, params_frozen)
        if cache_key in SIMULATION_CACHE:
            return SIMULATION_CACHE[cache_key]

        # 2. Prepare Data and Model
        if job_id not in MODEL_CACHE:
            logger.info(f"SIMULATION | Training baseline model for job {job_id}")
            y = df[target_col]
            if not pd.api.types.is_numeric_dtype(y):
                top_class = y.mode()[0]
                y = (y == top_class).astype(int)
            
            X = df.drop(columns=[target_col])
            protected_col = protected_attrs[0] if protected_attrs else None
            protected_attr_series = df[protected_col] if protected_col else pd.Series([1]*len(df))

            pipeline = build_pipeline(X)
            pipeline.fit(X, y)
            
            # Precompute baseline results
            baseline_preds = pipeline.predict(X)
            baseline_probs = pipeline.predict_proba(X)[:, 1]
            before_metrics = calculate_metrics(y, baseline_preds, protected_attr_series)
            
            MODEL_CACHE[job_id] = {
                "pipeline": pipeline, 
                "X": X, 
                "y": y,
                "probs": baseline_probs,
                "before_metrics": before_metrics,
                "protected_attr_series": protected_attr_series
            }
        
        cache = MODEL_CACHE[job_id]
        y = cache["y"]
        X = cache["X"]
        baseline_pipeline = cache["pipeline"]
        baseline_probs = cache["probs"]
        before_metrics = cache["before_metrics"]
        protected_attr_series = cache["protected_attr_series"]
        
        feature_used = None
        
        # 3. Apply Mitigation
        if method == "threshold_adjustment":
            threshold = params.get("threshold", 0.5)
            # Use cached probabilities - very fast
            new_predictions = (baseline_probs >= threshold).astype(int)
            after_metrics = calculate_metrics(y, new_predictions, protected_attr_series)
            
        elif method == "feature_removal":
            feature_to_remove = params.get("feature")
            if not feature_to_remove or feature_to_remove not in X.columns:
                raise ValueError(f"Feature '{feature_to_remove}' not found for removal")
            
            # For feature removal, we must retrain (but results will be cached in SIMULATION_CACHE)
            X_mod = X.drop(columns=[feature_to_remove])
            mod_pipeline = build_pipeline(X_mod)
            mod_pipeline.fit(X_mod, y)
            new_predictions = mod_pipeline.predict(X_mod)
            after_metrics = calculate_metrics(y, new_predictions, protected_attr_series)
            feature_used = feature_to_remove
            
        elif method == "reweighing":
            # Reweighing computes sample weights W = (P(Target) * P(Group)) / P(Target AND Group)
            # This equalizes representation across group-outcome combinations before training.
            df_temp = pd.DataFrame({'target': y, 'group': protected_attr_series})
            n_total = len(df_temp)
            
            p_t = df_temp.groupby('target').size() / n_total
            p_g = df_temp.groupby('group').size() / n_total
            p_tg = df_temp.groupby(['target', 'group']).size() / n_total
            
            df_temp['p_t'] = df_temp['target'].map(p_t)
            df_temp['p_g'] = df_temp['group'].map(p_g)
            df_temp['p_tg'] = pd.MultiIndex.from_arrays([df_temp['target'], df_temp['group']]).map(p_tg)
            
            sample_weights = (df_temp['p_t'] * df_temp['p_g'] / df_temp['p_tg']).fillna(1.0).values
            
            rw_pipeline = build_pipeline(X)
            rw_pipeline.fit(X, y, classifier__sample_weight=sample_weights)
            new_predictions = rw_pipeline.predict(X)
            after_metrics = calculate_metrics(y, new_predictions, protected_attr_series)
            
        else:
            raise ValueError(f"Unknown simulation method: {method}")

        # 4. Compute Results
        delta = {
            "disparity_reduction_pct": round(((before_metrics["disparity"] - after_metrics["disparity"]) / before_metrics["disparity"] * 100), 1) if before_metrics["disparity"] > 0 else 0,
            "accuracy_change_pct": round(((after_metrics["accuracy"] - before_metrics["accuracy"]) * 100), 1)
        }

        result = {
            "method": method,
            "before": before_metrics,
            "after": after_metrics,
            "delta": delta,
            "insight": generate_insight(before_metrics, after_metrics, method, params.get("threshold", 0.5), feature_used),
            "confidence": calculate_confidence(len(y), len(before_metrics["groups"]), before_metrics["disparity"])
        }
        
        # Store in simulation cache
        SIMULATION_CACHE[cache_key] = result
        return result

    except Exception as e:
        logger.error(f"Enhanced simulation failed: {str(e)}")
        return {
            "error": str(e),
            "status": "failed"
        }

def optimize_fairness(job_id: str, df: pd.DataFrame, target_col: str, protected_attrs: list) -> dict:
    """
    Sweeps thresholds to find the one that minimizes disparity 
    while keeping accuracy loss < 5% compared to baseline.
    """
    try:
        # Ensure model is trained and cached
        if job_id not in MODEL_CACHE:
            # Trigger training by running a default simulation
            simulate_mitigation_enhanced(job_id, df, target_col, protected_attrs, "threshold_adjustment", {"threshold": 0.5})
            
        cache = MODEL_CACHE[job_id]
        y = cache["y"]
        baseline_probs = cache["probs"]
        before_metrics = cache["before_metrics"]
        protected_attr_series = cache["protected_attr_series"]
        
        baseline_accuracy = before_metrics["accuracy"]
        
        best_threshold = 0.5
        min_disparity = float('inf')
        best_metrics = None
        tradeoff_curve = []
        
        # Sweep thresholds 0.1 to 0.9 with 0.05 steps
        for t in np.arange(0.1, 0.95, 0.05):
            t = round(float(t), 2)
            new_preds = (baseline_probs >= t).astype(int)
            metrics = calculate_metrics(y, new_preds, protected_attr_series)
            
            tradeoff_curve.append({
                "threshold": t,
                "disparity": metrics["disparity"],
                "accuracy": metrics["accuracy"]
            })
            
            acc_loss = baseline_accuracy - metrics["accuracy"]
            
            # Constraint: accuracy loss < 5%
            if acc_loss < 0.05:
                if metrics["disparity"] < min_disparity:
                    min_disparity = metrics["disparity"]
                    best_threshold = t
                    best_metrics = metrics
                    
        if best_metrics is None:
            # Fallback if no threshold meets the constraint
            best_threshold = 0.5
            best_metrics = before_metrics
            
        return {
            "optimal_threshold": best_threshold,
            "metrics": best_metrics,
            "baseline": before_metrics,
            "tradeoff_curve": tradeoff_curve,
            "status": "success"
        }
    except Exception as e:
        logger.error(f"Fairness optimization failed: {str(e)}")
        return {"error": str(e), "status": "failed"}

def generate_recommendation(job_id: str, df: pd.DataFrame, target: str, protected: list, results: dict) -> dict:
    """
    Combines audit results into multiple ranked recommendations with tradeoffs.
    """
    try:
        # Get optimization sweep
        optimization = results.get("optimization")
        if not optimization:
            optimization = optimize_fairness(job_id, df, target, protected)
            
        curve = optimization.get("tradeoff_curve", [])
        baseline = optimization.get("baseline", {})
        before_disp = baseline.get("disparity", 0.001)
        before_acc = baseline.get("accuracy", 1.0)
        
        if not curve:
            return {"error": "No tradeoff curve available", "status": "failed"}

        recommendations = []
        
        # 1. Best Fairness (Minimum Disparity)
        best_fairness = min(curve, key=lambda x: x["disparity"])
        f_red = round(((before_disp - best_fairness["disparity"]) / before_disp * 100), 1) if before_disp > 0 else 0
        f_acc = round((best_fairness["accuracy"] - before_acc) * 100, 1)
        recommendations.append({
            "label": "Maximum Fairness",
            "action": f"Set threshold to {best_fairness['threshold']:.2f}",
            "impact": f"Bias reduced by {f_red}%, accuracy {f_acc}%",
            "confidence": 0.92,
            "threshold": best_fairness['threshold']
        })

        # 2. Balanced (Optimization Objective: minimize disparity with < 5% loss)
        # The optimize_fairness already gives us this "optimal" threshold
        opt_thresh = optimization.get("optimal_threshold", 0.5)
        balanced = next((p for p in curve if abs(p["threshold"] - opt_thresh) < 0.01), curve[len(curve)//2])
        b_red = round(((before_disp - balanced["disparity"]) / before_disp * 100), 1) if before_disp > 0 else 0
        b_acc = round((balanced["accuracy"] - before_acc) * 100, 1)
        recommendations.append({
            "label": "Optimal Balance",
            "action": f"Set threshold to {balanced['threshold']:.2f}",
            "impact": f"Bias reduced by {b_red}%, accuracy {b_acc}%",
            "confidence": 0.88,
            "threshold": balanced['threshold']
        })

        # 3. High Performance (Threshold closest to baseline that still improves fairness)
        # Let's say we look for the highest accuracy point that reduces disparity by at least 10%
        performance_candidates = [p for p in curve if (before_disp - p["disparity"]) / before_disp > 0.1]
        if performance_candidates:
            best_perf = max(performance_candidates, key=lambda x: x["accuracy"])
            p_red = round(((before_disp - best_perf["disparity"]) / before_disp * 100), 1) if before_disp > 0 else 0
            p_acc = round((best_perf["accuracy"] - before_acc) * 100, 1)
            recommendations.append({
                "label": "High Performance",
                "action": f"Set threshold to {best_perf['threshold']:.2f}",
                "impact": f"Bias reduced by {p_red}%, accuracy {p_acc}%",
                "confidence": 0.85,
                "threshold": best_perf['threshold']
            })

        return {
            "recommendations": recommendations,
            "recommended": "Optimal Balance",
            "status": "success"
        }
    except Exception as e:
        logger.error(f"Recommendation generation failed: {str(e)}")
        return {"error": str(e), "status": "failed"}
