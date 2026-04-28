import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, TrendingDown } from 'lucide-react';
import { MetricStatus } from '../ui/MetricStatus';

interface ImpactSummaryBannerProps {
  disparity_score: number | string;
  impacted_group: string;
  law: string;
  affected_count: number | string;
  improved_count?: number | string;
}

export const ImpactSummaryBanner: React.FC<ImpactSummaryBannerProps> = ({
  disparity_score,
  impacted_group,
  law,
  affected_count,
  improved_count
}) => {
  const score = typeof disparity_score === 'string' ? parseFloat(disparity_score) : disparity_score;

  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  if (isNaN(score)) severity = 'high';
  else if (score < 0.5) severity = 'critical';
  else if (score < 0.8) severity = 'high';
  else if (score < 0.9) severity = 'medium';
  else severity = 'low';

  const severityConfig = {
    critical: {
      title: 'Critical Risk Detected',
      bg: 'bg-[#EF4444]/10',
      borderColor: 'border-[#EF4444]/35',
      textColor: 'text-[#EF4444]',
      icon: <AlertCircle className="text-[#EF4444]" size={24} />
    },
    high: {
      title: 'High Risk Detected',
      bg: 'bg-[#EF4444]/10',
      borderColor: 'border-[#EF4444]/30',
      textColor: 'text-[#EF4444]',
      icon: <AlertTriangle className="text-[#EF4444]" size={24} />
    },
    medium: {
      title: 'Medium Risk Detected',
      bg: 'bg-[#F59E0B]/10',
      borderColor: 'border-[#F59E0B]/30',
      textColor: 'text-[#F59E0B]',
      icon: <AlertTriangle className="text-[#F59E0B]" size={24} />
    },
    low: {
      title: 'Low Risk Detected',
      bg: 'bg-[#10B981]/10',
      borderColor: 'border-[#10B981]/30',
      textColor: 'text-[#10B981]',
      icon: <CheckCircle className="text-[#10B981]" size={24} />
    }
  };

  const current = severityConfig[severity];

  return (
    <div className={`rounded-3xl border ${current.borderColor} ${current.bg} p-6 shadow-2xl shadow-black/20`}>
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-[#0B1220] border border-white/[0.08] shrink-0">
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
              tooltip={`Disparate Impact: ${(Number(score) || 0).toFixed(2)} (${score < 0.8 ? 'Below' : 'At or above'} 0.80 threshold)`}
            />
            <p className="text-xs text-[#9CA3AF]">
              Disparate Impact: <span className="font-mono text-white">{(Number(score) || 0).toFixed(2)}</span>{' '}
              {score < 0.8 ? 'Below' : 'At or above'} 0.80 threshold
            </p>

            <div className="flex items-center gap-2">
              <span className="text-slate-500">-&gt;</span>
              <span>Violates</span>
              <span className="font-bold text-white bg-slate-900/40 px-2 py-0.5 rounded border border-slate-800 text-xs">
                {law}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.08] mt-2">
            <TrendingDown className="text-slate-400" size={16} />
            <p className="text-xs font-bold text-slate-400">
              ~<span className="text-white font-black">{typeof affected_count === 'number' ? affected_count.toLocaleString() : affected_count}</span> affected
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

export default ImpactSummaryBanner;
