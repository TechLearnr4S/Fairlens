import React from 'react';
import { Info } from 'lucide-react';

type MetricStatusProps = {
  label: string;
  value: number;
  threshold: number;
  /** For DI ratio: lower than threshold is worse. */
  lowerIsWorse?: boolean;
  tooltip?: string;
  className?: string;
};

function computeStatus(value: number, threshold: number, lowerIsWorse: boolean) {
  const violation = lowerIsWorse ? value < threshold : value > threshold;
  const passes = !violation;
  const icon = passes ? '✅' : '❌';
  const color = passes ? 'text-emerald-400' : 'text-rose-400';
  const relation = lowerIsWorse ? 'Below' : 'Above';
  const detail = passes
    ? `(Meets ${threshold.toFixed(2)} legal threshold)`
    : `(${relation} ${threshold.toFixed(2)} legal threshold)`;
  return { passes, icon, color, detail };
}

/**
 * Compliance-style metric display with pass/fail indicator and hover explanation.
 * Example: `Disparate Impact: 0.62 ❌ (Below 0.80 legal threshold)`.
 */
export const MetricStatus: React.FC<MetricStatusProps> = ({
  label,
  value,
  threshold,
  lowerIsWorse = false,
  tooltip,
  className = '',
}) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeThreshold = Number.isFinite(threshold) ? threshold : 0;
  const { icon, color, detail } = computeStatus(safeValue, safeThreshold, lowerIsWorse);

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <p className="text-sm font-semibold text-slate-200">
        <span className="text-slate-300">{label}:</span>{' '}
        <span className={`font-black ${color}`}>{safeValue.toFixed(2)}</span>{' '}
        <span className={color}>{icon}</span>{' '}
        <span className={`${color} font-semibold`}>{detail}</span>
      </p>
      <span className="relative group inline-flex">
        <Info size={14} className="text-slate-500 cursor-help" aria-hidden />
        <span className="pointer-events-none absolute z-20 left-1/2 -translate-x-1/2 top-full mt-2 w-72 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
          {tooltip ?? 'Compliance interpretation based on configured legal threshold.'}
        </span>
      </span>
    </div>
  );
};

export default MetricStatus;
