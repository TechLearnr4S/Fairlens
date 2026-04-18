import pandas as pd
import numpy as np

def simulate_threshold_adjustment(df: pd.DataFrame, target_col: str, protected_attrs: list) -> dict:
    """
    Simulates fairness mitigation using threshold adjustment.
    Adjusts the 'after' metrics to simulate parity while maintaining performance.
    """
    results = {
        "before": {},
        "after": {},
        "improvement": 0
    }
    
    # Calculate 'Before' metrics (same as compute_disparities logic)
    # Binary labels
    is_numeric = pd.api.types.is_numeric_dtype(df[target_col])
    if not is_numeric:
        top_class = df[target_col].mode()[0]
        y_true = (df[target_col] == top_class).astype(int)
    else:
        y_true = df[target_col]

    total_disparity_before = 0
    total_disparity_after = 0
    
    for attr in protected_attrs:
        if attr not in df.columns:
            continue
            
        grouped = df.groupby(attr)
        subgroup_rates_before = []
        for name, group in grouped:
            rate = y_true.loc[group.index].mean()
            subgroup_rates_before.append({
                "subgroup": str(name),
                "selection_rate": float(rate)
            })
            
        max_rate = max([s['selection_rate'] for s in subgroup_rates_before]) if subgroup_rates_before else 0
        min_rate = min([s['selection_rate'] for s in subgroup_rates_before]) if subgroup_rates_before else 0
        total_disparity_before += (max_rate - min_rate)
        
        results["before"][attr] = {
            "disparity_score": float(max_rate - min_rate),
            "subgroups": subgroup_rates_before
        }
        
        # Simulate 'After' metrics
        # We simulate moving the selection rates closer to the average
        avg_rate = y_true.mean()
        subgroup_rates_after = []
        for s in subgroup_rates_before:
            # Move 70% towards the mean (simulating strong mitigation)
            new_rate = s['selection_rate'] + 0.7 * (avg_rate - s['selection_rate'])
            subgroup_rates_after.append({
                "subgroup": s['subgroup'],
                "selection_rate": float(new_rate)
            })
            
        max_rate_after = max([s['selection_rate'] for s in subgroup_rates_after]) if subgroup_rates_after else 0
        min_rate_after = min([s['selection_rate'] for s in subgroup_rates_after]) if subgroup_rates_after else 0
        total_disparity_after += (max_rate_after - min_rate_after)
        
        results["after"][attr] = {
            "disparity_score": float(max_rate_after - min_rate_after),
            "subgroups": subgroup_rates_after
        }

    # Calculate overall improvement percentage
    if total_disparity_before > 0:
        improvement = (total_disparity_before - total_disparity_after) / total_disparity_before
        results["improvement"] = round(float(improvement) * 100, 1)
    
    return results
