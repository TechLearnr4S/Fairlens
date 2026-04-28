import pandas as pd
import numpy as np
import logging
from scipy import stats
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

class StatisticallyRigorousEvaluator:
    """
    Enterprise-grade fairness evaluator with statistical significance, 
    uncertainty quantification, and policy-driven decision making.
    """

    def __init__(
        self, 
        df: pd.DataFrame, 
        y_true_col: str, 
        y_pred_col: str, 
        protected_attrs: List[str],
        probs_col: Optional[str] = None,
        policy: Optional[Dict] = None,
        bootstrap_samples: int = 200
    ):
        self.df = df.copy()
        self.y_true_col = y_true_col
        self.y_pred_col = y_pred_col
        self.protected_attrs = protected_attrs
        self.probs_col = probs_col
        self.policy = policy or {
            "max_disparity": 0.1,
            "min_accuracy": 0.8,
            "alpha": 0.05,
            "min_group_size": 50
        }
        self.bootstrap_samples = bootstrap_samples

    def evaluate(self) -> Dict[str, Any]:
        # 1. Prepare Data
        self._binarize_inputs()
        
        # 2. Compute Point Estimates (Grouped)
        results = self._compute_metrics(self.df)
        
        # 3. Bootstrap Confidence Intervals
        results["confidence_intervals"] = self._compute_bootstrapped_cis()
        
        # 4. Significance Testing (vs Global Mean or Reference)
        results["significance"] = self._compute_significance(results["groups"])
        
        # 5. Calibration & Threshold Analysis (if probs)
        results["calibration"] = self._compute_calibration()
        results["pareto"] = self._compute_pareto_front()
        
        # 6. Policy-Driven Decision
        results["decision"] = self._run_decision_engine(results)
        
        # 7. Insights
        results["insights"] = self._generate_rigorous_insights(results)
        
        results["metadata"] = {
            "n": len(self.df),
            "bootstrap_samples": self.bootstrap_samples,
            "alpha": self.policy.get("alpha", 0.05)
        }
        
        return results

    def _binarize_inputs(self):
        for col in [self.y_true_col, self.y_pred_col]:
            self.df[col] = pd.to_numeric(self.df[col], errors='coerce').fillna(0).astype(int)
        if self.probs_col and self.probs_col in self.df.columns:
            self.df[self.probs_col] = pd.to_numeric(self.df[self.probs_col], errors='coerce').fillna(0.5)

    def _compute_metrics(self, df: pd.DataFrame) -> Dict[str, Any]:
        # Vectorized counts
        df['tp'] = ((df[self.y_true_col] == 1) & (df[self.y_pred_col] == 1)).astype(int)
        df['tn'] = ((df[self.y_true_col] == 0) & (df[self.y_pred_col] == 0)).astype(int)
        df['fp'] = ((df[self.y_true_col] == 0) & (df[self.y_pred_col] == 1)).astype(int)
        df['fn'] = ((df[self.y_true_col] == 1) & (df[self.y_pred_col] == 0)).astype(int)

        # Multi-attribute intersection key
        df['__group__'] = df[self.protected_attrs].astype(str).agg(' + '.join, axis=1)
        
        gs = df.groupby('__group__').agg({
            'tp': 'sum', 'tn': 'sum', 'fp': 'sum', 'fn': 'sum', self.y_true_col: 'count'
        }).rename(columns={self.y_true_col: 'size'})

        # Point estimates
        gs['accuracy'] = (gs['tp'] + gs['tn']) / gs['size']
        gs['tpr'] = gs['tp'] / (gs['tp'] + gs['fn']).replace(0, np.nan)
        gs['fpr'] = gs['fp'] / (gs['fp'] + gs['tn']).replace(0, np.nan)
        gs['selection_rate'] = (gs['tp'] + gs['fp']) / gs['size']
        gs = gs.fillna(0)

        groups = {}
        for name, row in gs.iterrows():
            groups[str(name)] = {
                "metrics": row.to_dict(),
                "is_low_power": int(row['size']) < self.policy.get("min_group_size", 50)
            }

        overall_acc = (df[self.y_true_col] == df[self.y_pred_col]).mean()
        
        return {
            "groups": groups,
            "overall_accuracy": float(overall_acc),
            "disparities": {
                "tpr_gap": float(gs['tpr'].max() - gs['tpr'].min()),
                "fpr_gap": float(gs['fpr'].max() - gs['fpr'].min()),
                "sr_gap": float(gs['selection_rate'].max() - gs['selection_rate'].min())
            }
        }

    def _compute_bootstrapped_cis(self) -> Dict[str, Any]:
        n = len(self.df)
        tpr_gaps = []
        fpr_gaps = []
        sr_gaps = []
        
        # Deterministic seed for reproducible CIs
        rng = np.random.RandomState(42)
        
        for _ in range(self.bootstrap_samples):
            # Efficient sampling using numpy
            indices = rng.choice(n, size=n, replace=True)
            boot_df = self.df.iloc[indices].copy()
            m = self._compute_metrics(boot_df)
            tpr_gaps.append(m["disparities"]["tpr_gap"])
            fpr_gaps.append(m["disparities"]["fpr_gap"])
            sr_gaps.append(m["disparities"]["sr_gap"])
        
        alpha = self.policy.get("alpha", 0.05)
        lower_pct = (alpha / 2) * 100
        upper_pct = (1 - alpha / 2) * 100
        
        def compute_ci(arr):
            if not arr:
                return [0.0, 0.0]
            return [
                round(float(np.percentile(arr, lower_pct)), 4),
                round(float(np.percentile(arr, upper_pct)), 4)
            ]
            
        return {
            "tpr_gap": compute_ci(tpr_gaps),
            "fpr_gap": compute_ci(fpr_gaps),
            "sr_gap": compute_ci(sr_gaps)
        }

    def _compute_significance(self, groups: Dict) -> Dict[str, Any]:
        alpha = self.policy.get("alpha", 0.05)
        significance = {}
        
        group_names = list(groups.keys())
        if not group_names: return {}
        
        # Compare each group vs reference (max group by size)
        ref_group = max(group_names, key=lambda k: groups[k]['metrics']['size'])
        n_ref = groups[ref_group]['metrics']['size']
        tpr_ref = groups[ref_group]['metrics']['tpr']
        
        for g in group_names:
            if g == ref_group: continue
            
            n_g = groups[g]['metrics']['size']
            tpr_g = groups[g]['metrics']['tpr']
            
            # Z-test for proportions
            p_combined = (tpr_ref * n_ref + tpr_g * n_g) / (n_ref + n_g)
            se = np.sqrt(p_combined * (1 - p_combined) * (1/n_ref + 1/n_g)) + 1e-8
            z = abs(tpr_ref - tpr_g) / se
            p_val = 2 * (1 - stats.norm.cdf(z))
            
            significance[g] = {
                "vs_reference": ref_group,
                "tpr_p_value": round(float(p_val), 4),
                "is_significant": p_val < alpha
            }
            
        return significance

    def _compute_calibration(self) -> Dict[str, Any]:
        if not self.probs_col or self.probs_col not in self.df.columns:
            return {}
        
        # Expected Calibration Error (ECE)
        y_true = self.df[self.y_true_col].values
        y_prob = self.df[self.probs_col].values
        
        # 10 bins
        bins = np.linspace(0, 1, 11)
        ece = 0
        bin_accuracies = []
        bin_confidences = []
        
        for i in range(len(bins)-1):
            mask = (y_prob > bins[i]) & (y_prob <= bins[i+1])
            if mask.sum() > 0:
                acc = y_true[mask].mean()
                conf = y_prob[mask].mean()
                ece += (mask.sum() / len(y_true)) * abs(acc - conf)
                bin_accuracies.append(float(acc))
                bin_confidences.append(float(conf))
            else:
                bin_accuracies.append(0.0)
                bin_confidences.append(float((bins[i] + bins[i+1])/2))

        return {
            "ece": round(float(ece), 4),
            "reliability_curve": {
                "accuracy": bin_accuracies,
                "confidence": bin_confidences
            }
        }

    def _compute_pareto_front(self) -> List[Dict]:
        if not self.probs_col or self.probs_col not in self.df.columns:
            return []
            
        y_true = self.df[self.y_true_col].values
        y_prob = self.df[self.probs_col].values
        
        pareto = []
        for thresh in np.linspace(0.1, 0.9, 9):
            y_pred = (y_prob >= thresh).astype(int)
            acc = (y_true == y_pred).mean()
            # Simplified disparity for pareto
            disp = abs(y_pred.mean() - y_true.mean())
            pareto.append({
                "threshold": round(thresh, 2),
                "accuracy": round(float(acc), 4),
                "disparity": round(float(disp), 4)
            })
        return pareto

    def _run_decision_engine(self, results: Dict) -> Dict[str, Any]:
        violations = []
        
        max_disp = results["disparities"]["tpr_gap"]
        if max_disp > self.policy["max_disparity"]:
            violations.append(f"Equal Opportunity violation: TPR Gap {max_disp:.1%} exceeds {self.policy['max_disparity']:.1%} limit.")
            
        if results["overall_accuracy"] < self.policy["min_accuracy"]:
            violations.append(f"Performance violation: Global accuracy {results['overall_accuracy']:.1%} below required {self.policy['min_accuracy']:.1%}.")

        decision = "Approve"
        if violations:
            decision = "Reject" if len(violations) > 1 else "Conditional"
            
        return {
            "status": decision,
            "violations": violations,
            "policy_applied": self.policy
        }

    def _generate_rigorous_insights(self, results: Dict) -> List[str]:
        insights = []
        sig = results["significance"]
        for g, s in sig.items():
            if s["is_significant"]:
                insights.append(f"Subgroup '{g}' exhibits a statistically significant TPR disparity (p={s['tpr_p_value']}) compared to reference.")
        
        if results.get("calibration", {}).get("ece", 0) > 0.1:
            insights.append(f"Model is poorly calibrated (ECE={results['calibration']['ece']}). Risk estimates may be unreliable.")
            
        return insights
