import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
from sklearn.feature_selection import mutual_info_classif

def identify_proxies(df: pd.DataFrame, protected_attrs: list, top_n: int = 3) -> list:
    """
    Identifies features that are highly correlated with the protected attributes,
    acting as hidden proxies for bias (e.g., ZIP code as a proxy for race).
    Uses Mutual Information to handle non-linear and categorical relations.
    """
    proxies = []
    
    # Drop rows with NaNs to run MI cleanly
    clean_df = df.dropna().copy()
    if len(clean_df) == 0:
        return proxies
        
    # We will sample to speed up the process for large datasets
    if len(clean_df) > 5000:
        clean_df = clean_df.sample(5000, random_state=42)
        
    for p_attr in protected_attrs:
        if p_attr not in clean_df.columns:
            continue
            
        target_series = clean_df[p_attr]
        # Encode target if it's string categorical
        if target_series.dtype == 'object' or target_series.dtype.name == 'category':
            le = LabelEncoder()
            y = le.fit_transform(target_series.astype(str))
        else:
            y = target_series.values
            
        # Get candidate features (exclude protected attributes)
        candidates = [col for col in clean_df.columns if col not in protected_attrs]
        X = clean_df[candidates].copy()
        
        # Label encode any string columns in features
        for col in X.select_dtypes(include=['object', 'category']).columns:
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            
        # Ensure distinct inputs exist
        if len(np.unique(y)) <= 1 or X.empty:
            continue
            
        # Calculate Mutual Information
        mi_scores = mutual_info_classif(X, y, random_state=42)
        
        # Tie scores back to column names
        for col, score in zip(candidates, mi_scores):
            # Normalization scale heuristics: >0.1 starts becoming suspicious, >0.2 very high
            if score > 0.05: 
                proxies.append({
                    "protected_attribute": p_attr,
                    "proxy_feature": col,
                    "correlation_score": round(score, 3),
                    "severity": "High" if score > 0.15 else "Medium"
                })
                
    # Sort by descending score to get the worst offenders first
    proxies.sort(key=lambda x: x["correlation_score"], reverse=True)
    return proxies[:top_n]
