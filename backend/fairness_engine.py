import pandas as pd

def compute_disparities(df: pd.DataFrame, target_col: str, protected_attrs: list) -> dict:
    results = {}
    
    # We will assume the target column is already binarized or categorical.
    # For MVP, let's treat the most frequent class as the "favorable" outcome, 
    # or just use it raw if numeric (e.g. 1/0).
    is_numeric = pd.api.types.is_numeric_dtype(df[target_col])
    if not is_numeric:
        # Convert string categories to a binary 1/0 for generic analysis
        top_class = df[target_col].mode()[0]
        y_true = (df[target_col] == top_class).astype(int)
    else:
        y_true = df[target_col]

    # For the MVP, we assume model prediction (y_pred) is identical to y_true for audit of the pure dataset,
    # OR the user uploaded model predictions as target_col and true labels as another.
    # To keep it simple: we analyze Selection Rate of the target_col (how often outcome is positive).
    
    for attr in protected_attrs:
        if attr not in df.columns:
            continue
            
        # Group by the protected attribute
        grouped = df.groupby(attr)
        
        # Calculate positive rate per subgroup
        subgroup_rates = []
        for name, group in grouped:
            # The rate is the mean of positive outcomes
            rate = y_true.loc[group.index].mean()
            subgroup_rates.append({
                "subgroup": str(name),
                "selection_rate": float(rate),
                "count": int(len(group))
            })
            
        # Calculate generic Demographic Parity Difference manually or via fairlearn
        # fairlearn MetricFrame requires y_true and y_pred. If this is a historical dataset,
        # we are just looking at historical selection rate differences.
        max_rate = max([s['selection_rate'] for s in subgroup_rates]) if subgroup_rates else 0
        min_rate = min([s['selection_rate'] for s in subgroup_rates]) if subgroup_rates else 0
        dp_diff = float(max_rate - min_rate)
        
        results[attr] = {
            "disparity_score": dp_diff,
            "risk_level": "High" if dp_diff > 0.2 else "Medium" if dp_diff > 0.1 else "Low",
            "subgroups": subgroup_rates
        }
        
    return results
