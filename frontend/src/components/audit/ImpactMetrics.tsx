import React from 'react';
import { ArrowDown, ArrowRight, BarChart3 } from 'lucide-react';
import { computeImpactMetrics } from '../../utils/impact';

export interface ImpactMetricsProps {
  /** Total rows in the uploaded dataset */
  totalRows: number;
  /** Row count for the subgroup under fairness analysis */
  subgroupSize: number;
  /** Disparity gap — usually 0–1; values in (1,100] interpreted as percentage points (drives estimated “people helped”) */
  disparityGap: number;
  affectedGroup: string;
  /** Disparity magnitude before mitigation (%), e.g. 23 */
  beforeDisparityPercent: number;
  /** Disparity after mitigation (%), e.g. 4 */
  afterDisparityPercent: number;
  className?: string;
}

function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export const ImpactMetrics: React.FC<ImpactMetricsProps> = ({
  totalRows,
  subgroupSize,
  disparityGap,
  affectedGroup,
  beforeDisparityPercent,
  afterDisparityPercent,
  className = '',
}) => {
  const { datasetSize, affected, improved } = computeImpactMetrics(
    totalRows,
    subgroupSize,
    disparityGap,
  );

  const before = clampPct(beforeDisparityPercent);
  const after = clampPct(afterDisparityPercent);
  /** Shared scale so bar widths are comparable */
  const barScale = Math.max(before, after, 1);

  return (
    <div
      className={`glass-panel rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900/80 to-indigo-950/20 p-6 shadow-xl ${className}`}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <BarChart3 className="text-indigo-400" size={22} />
        </div>
        <h3 className="text-lg font-black text-white tracking-tight">
          <span className="mr-2" aria-hidden>
            📊
          </span>
          Estimated Impact
        </h3>
      </div>

      {/* Before / After disparity */}
      <div
        className="mb-6 pb-6 border-b border-slate-700/40"
        role="group"
        aria-label="Disparity before and after mitigation"
      >
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-4">
          Disparity comparison
        </p>
        <div className="flex flex-col md:flex-row md:items-stretch gap-4 md:gap-3">
          <div className="flex-1 rounded-xl border border-rose-500/25 bg-rose-950/30 p-4 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400/90 mb-1">
              Before
            </p>
            <p className="text-3xl md:text-4xl font-black tabular-nums text-white mb-3">
              {before.toFixed(0)}
              <span className="text-lg text-rose-200/90 font-bold">%</span>
            </p>
            <p className="text-xs text-slate-400 mb-2">Disparity</p>
            <div className="h-2.5 rounded-full bg-slate-800/90 overflow-hidden border border-slate-700/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-400 transition-[width] duration-500"
                style={{ width: `${(before / barScale) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex flex-row md:flex-col items-center justify-center gap-2 py-2 md:py-0 md:px-2 shrink-0 text-center">
            <ArrowRight
              className="hidden md:block text-indigo-400"
              size={28}
              strokeWidth={2.25}
            />
            <ArrowDown className="md:hidden text-indigo-400" size={26} strokeWidth={2.25} />
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400/90 leading-tight max-w-[4.5rem]">
              Mitigation
            </span>
          </div>

          <div className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-4 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90 mb-1">
              After mitigation
            </p>
            <p className="text-3xl md:text-4xl font-black tabular-nums text-white mb-3">
              {after.toFixed(0)}
              <span className="text-lg text-emerald-200/90 font-bold">%</span>
            </p>
            <p className="text-xs text-slate-400 mb-2">Disparity</p>
            <div className="h-2.5 rounded-full bg-slate-800/90 overflow-hidden border border-slate-700/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-500"
                style={{ width: `${(after / barScale) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-slate-700/40 pb-3">
          <dt className="text-slate-400 font-medium">Dataset size</dt>
          <dd className="text-white font-bold tabular-nums">{formatInteger(datasetSize)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-700/40 pb-3">
          <dt className="text-slate-400 font-medium">Affected group</dt>
          <dd className="text-right max-w-[60%]">
            <span className="font-bold text-white capitalize block">{affectedGroup}</span>
            <span className="text-slate-500 text-xs tabular-nums">{formatInteger(affected)} rows</span>
          </dd>
        </div>
        <div className="flex justify-between gap-4 pb-1">
          <dt className="text-slate-400 font-medium">People helped</dt>
          <dd className="text-emerald-400 font-black tabular-nums">{formatInteger(improved)}</dd>
        </div>
      </dl>

      <div className="mt-6 pt-4 border-t border-slate-700/40 flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 text-xs font-bold text-emerald-300">
          SDG 10 <span aria-hidden>✓</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 border border-sky-500/25 px-3 py-1.5 text-xs font-bold text-sky-300">
          SDG 8 <span aria-hidden>✓</span>
        </span>
      </div>
    </div>
  );
};
