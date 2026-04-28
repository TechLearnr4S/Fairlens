import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, TrendingDown } from 'lucide-react';
import { MetricStatus } from '../ui/MetricStatus';

interface DemoSummaryBannerProps {
  disparity_score: number | string;
  impacted_group: string;
  law: string;
  affected_count: number | string;
  improved_count?: number | string;
}

export const DemoSummaryBanner: React.FC<DemoSummaryBannerProps> = ({
  disparity_score,
  impacted_group,
  law,
  affected_count,
  improved_count
}) => {
  // Parse disparity score to number if it's a string
  const score = typeof disparity_score === 'string' ? parseFloat(disparity_score) : disparity_score;
  
  // Determine severity based on disparate impact score
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  if (isNaN(score)) severity = 'high'; // Default if unparseable
  else if (score < 0.5) severity = 'critical';
  else if (score < 0.8) severity = 'high';
  else if (score < 0.9) severity = 'medium';
  else severity = 'low';

  const severityConfig = {
    critical: {
      title: '🚨 Critical Risk Detected',
      color: 'from-red-600/20 to-rose-600/5',
      borderColor: 'border-red-500/30',
      textColor: 'text-red-400',
      icon: <AlertCircle className="text-red-400 animate-pulse" size={24} />
    },
    high: {
      title: '🚨 High Risk Detected',
      color: 'from-orange-600/20 to-amber-600/5',
      borderColor: 'border-orange-500/30',
      textColor: 'text-orange-400',
      icon: <AlertTriangle className="text-orange-400 animate-pulse" size={24} />
    },
    medium: {
      title: '⚠️ Medium Risk Detected',
      color: 'from-yellow-600/20 to-amber-600/5',
      borderColor: 'border-yellow-500/30',
      textColor: 'text-yellow-400',
      icon: <AlertTriangle className="text-yellow-400" size={24} />
    },
    low: {
      title: '✅ Low Risk Detected',
      color: 'from-emerald-600/20 to-green-600/5',
      borderColor: 'border-emerald-500/30',
      textColor: 'text-emerald-400',
      icon: <CheckCircle className="text-emerald-400" size={24} />
    }
  };

  const current = severityConfig[severity];

  return (
    <div className={`glass-panel p-6 rounded-2xl border ${current.borderColor} bg-gradient-to-br ${current.color} shadow-2xl relative overflow-hidden transition-all duration-500 hover:scale-[1.02]`}>
      {/* Background Glow Effect */}
      <div className="absolute -right-12 -top-12 w-40 h-40 bg-gradient-to-br from-slate-400/10 to-transparent blur-3xl rounded-full pointer-events-none" />

      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-700/30 shadow-inner shrink-0">
          {current.icon}
        </div>
        
        <div className="flex-1 space-y-3">
          <div>
            <h3 className={`text-sm font-black uppercase tracking-widest ${current.textColor} flex items-center gap-2`}>
              {current.title}
            </h3>
            <p className="text-xl font-black text-white mt-1 capitalize">
              {impacted_group} bias found
            </p>
          </div>

          <div className="space-y-2 text-slate-300 font-medium text-sm">
            <MetricStatus
              label="Disparate Impact"
              value={Number(score) || 0}
              threshold={0.8}
              lowerIsWorse
              tooltip="EEOC four-fifths rule: values below 0.80 may indicate adverse impact."
            />

            <div className="flex items-center gap-2">
              <span className="text-slate-500">→</span>
              <span>Violates</span>
              <span className="font-bold text-white bg-slate-900/40 px-2 py-0.5 rounded border border-slate-800 text-xs">
                {law}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-700/20 mt-2">
            <TrendingDown className="text-slate-400" size={16} />
            <p className="text-xs font-bold text-slate-400">
              📉 ~<span className="text-white font-black">{typeof affected_count === 'number' ? affected_count.toLocaleString() : affected_count}</span> affected
            </p>
            {improved_count != null && (
              <p className="text-xs font-bold text-emerald-300 ml-2">
                · ~{typeof improved_count === 'number' ? improved_count.toLocaleString() : improved_count} improved
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoSummaryBanner;
