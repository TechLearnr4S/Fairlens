import React, { useState } from 'react';
import { CheckCircle, HelpCircle } from 'lucide-react';
import { estimateProxyRiskScore } from '../../utils/proxyRiskEstimate';

interface ColumnSelectorProps {
  columns: string[];
  selectedColumns: string[];
  onToggle: (column: string) => void;
}

export const EnhancedColumnSelector: React.FC<ColumnSelectorProps> = ({
  columns,
  selectedColumns,
  onToggle,
}) => {
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
  const [hoveredProxy, setHoveredProxy] = useState<string | null>(null);

  const getSmartBadge = (col: string) => {
    const lower = col.toLowerCase();

    if (['sex', 'gender'].includes(lower)) {
      return {
        label: '⚠️ Gender-sensitive',
        tooltip:
          'Federal law prohibits discrimination based on gender in automated decisioning.',
        color: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      };
    }
    if (['race', 'ethnicity', 'color'].includes(lower)) {
      return {
        label: '⚠️ Protected',
        tooltip:
          'Protected attribute under the Civil Rights Act. Direct usage carries severe risk.',
        color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      };
    }
    if (
      ['zip', 'zipcode', 'neighborhood', 'address', 'location'].includes(lower)
    ) {
      return {
        label: '⚠️ Proxy risk',
        tooltip:
          'Geographic identifiers frequently leak racial or socio-economic indicators.',
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
    }
    return null;
  };

  const proxyRiskStyle = (score: number) => {
    if (score >= 0.65) {
      return {
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
        tooltip:
          'Column name suggests location, geography, or postal identifiers — frequent proxies for socio-economic class and segregation.',
      };
    }
    if (score >= 0.4) {
      return {
        badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        tooltip:
          'Name-derived fields tend to correlate with ethnicity and ancestry in practice; statistical MI may differ.',
      };
    }
    return {
      badge: 'bg-slate-600/40 text-slate-400 border-slate-600/60',
      tooltip:
        'Identifier-like naming is usually lower surrogate proxy risk by name heuristic alone — still audit end-to-end.',
    };
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
      {columns.map((col) => {
        const badge = getSmartBadge(col);
        const isSelected = selectedColumns.includes(col);
        const proxy = estimateProxyRiskScore(col);
        const prStyle = proxyRiskStyle(proxy.risk_score);

        return (
          <div
            key={col}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle(col);
              }
            }}
            onClick={() => onToggle(col)}
            className={`flex flex-col px-5 py-4 rounded-xl border cursor-pointer transition-all duration-200 relative group select-none ${
              isSelected
                ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.1)] ring-1 ring-indigo-500'
                : 'bg-dark-800 border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center justify-between w-full gap-2">
              <span
                className={`font-bold transition-colors truncate ${
                  isSelected
                    ? 'text-indigo-400'
                    : 'text-slate-300 group-hover:text-white'
                }`}
              >
                {col}
              </span>
              <div
                className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'border-slate-600 group-hover:border-slate-400'
                }`}
              >
                {isSelected && <CheckCircle size={12} />}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 relative">
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border cursor-help ${prStyle.badge}`}
                onMouseEnter={() => setHoveredProxy(col)}
                onMouseLeave={() => setHoveredProxy(null)}
              >
                {proxy.label}{' '}
                <span className="tabular-nums opacity-90">
                  ({Math.round(proxy.risk_score * 100)}%)
                </span>
              </span>
              {hoveredProxy === col && (
                <div className="absolute left-0 bottom-full mb-2 z-50 bg-slate-900 border border-slate-700 text-slate-200 text-xs p-3 rounded-xl shadow-2xl w-56 animate-in fade-in duration-200">
                  <p className="leading-relaxed flex items-start gap-2">
                    <HelpCircle
                      size={14}
                      className="text-indigo-400 shrink-0 mt-0.5"
                    />
                    {prStyle.tooltip}
                  </p>
                  <div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-700 absolute -bottom-1 left-4 rotate-45" />
                </div>
              )}
            </div>

            {badge && (
              <div className="mt-3 flex items-center gap-1.5 relative">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border cursor-help ${badge.color}`}
                  onMouseEnter={() => setHoveredBadge(col)}
                  onMouseLeave={() => setHoveredBadge(null)}
                >
                  {badge.label}
                </span>

                {hoveredBadge === col && (
                  <div className="absolute left-0 bottom-full mb-2 z-50 bg-slate-900 border border-slate-700 text-slate-200 text-xs p-3 rounded-xl shadow-2xl w-52 animate-in fade-in duration-200">
                    <p className="leading-relaxed flex items-start gap-2">
                      <HelpCircle
                        size={14}
                        className="text-indigo-400 shrink-0 mt-0.5"
                      />
                      {badge.tooltip}
                    </p>
                    <div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-700 absolute -bottom-1 left-4 rotate-45" />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EnhancedColumnSelector;
