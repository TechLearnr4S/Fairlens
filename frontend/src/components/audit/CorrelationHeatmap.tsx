import React from 'react';
import { HelpCircle } from 'lucide-react';

interface HeatmapProps {
  matrix: Record<string, Record<string, any>>;
}

export default function CorrelationHeatmap({ matrix }: HeatmapProps) {
  // protected_attr -> { feature -> info }
  const protectedAttrs = Object.keys(matrix);
  if (protectedAttrs.length === 0) return null;

  const features = Object.keys(matrix[protectedAttrs[0]]);

  const getColor = (score: number) => {
    if (score > 0.5) return 'bg-rose-500 text-white'; // High Risk
    if (score > 0.2) return 'bg-amber-400 text-dark-900'; // Medium Risk
    return 'bg-indigo-900/40 text-slate-400'; // Low Risk
  };

  const getIntensity = (score: number) => {
    if (score > 0.5) return 'border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)] z-10';
    return 'border-transparent';
  };

  return (
    <div className="glass-panel p-6 border-slate-700/50 bg-slate-900/20 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Feature–Attribute Correlation Heatmap
          </h3>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">
            Systemic Relationship Matrix
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-tighter">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-indigo-900/40" /> Low</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-400" /> Med</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-rose-500" /> High Risk</div>
        </div>
      </div>

      <div className="relative overflow-x-auto custom-scrollbar pb-4">
        <div className="inline-block min-w-full align-middle">
          <div className="grid" style={{ 
            gridTemplateColumns: `180px repeat(${protectedAttrs.length}, 120px)`,
            gap: '4px'
          }}>
            {/* Header / X-Axis */}
            <div className="h-10" /> {/* Corner spacer */}
            {protectedAttrs.map(attr => (
              <div key={attr} className="h-10 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest text-center truncate px-2 bg-slate-800/30 rounded-t-lg border-b-2 border-primary-500/30">
                {attr}
              </div>
            ))}

            {/* Rows / Y-Axis */}
            {features.map(feat => (
              <React.Fragment key={feat}>
                {/* Feature Label */}
                <div className="h-12 flex items-center pr-4 text-xs font-bold text-slate-300 truncate bg-slate-800/10 pl-3 rounded-l-lg border-l-2 border-slate-700">
                  {feat}
                </div>
                
                {/* Score Cells */}
                {protectedAttrs.map(attr => {
                  const score = matrix[attr][feat]?.correlation_score || 0;
                  const method = matrix[attr][feat]?.method || 'N/A';
                  
                  return (
                    <div 
                      key={`${feat}-${attr}`}
                      className={`group relative h-12 flex items-center justify-center rounded-sm transition-all duration-300 border-2 hover:scale-105 hover:z-20 ${getColor(score)} ${getIntensity(score)}`}
                    >
                      <span className="text-xs font-mono font-bold">
                        {score.toFixed(3)}
                      </span>
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-40 p-3 bg-dark-950 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 border border-slate-700 shadow-2xl backdrop-blur-md">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center pb-1 border-b border-white/5">
                            <span className="text-slate-500 font-bold uppercase tracking-widest">Score</span>
                            <span className="text-white font-mono">{score.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500 font-bold uppercase tracking-widest">Method</span>
                            <span className="text-primary-400 uppercase">{method}</span>
                          </div>
                          <div className="mt-1 pt-1 text-[9px] text-slate-400 italic leading-tight">
                            Measures dependency between '{feat}' and '{attr}'.
                          </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-dark-950" />
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-4 p-4 bg-primary-500/5 rounded-xl border border-primary-500/10">
        <HelpCircle className="text-primary-400 shrink-0 mt-0.5" size={16} />
        <div className="text-[10px] text-slate-400 leading-relaxed uppercase font-bold tracking-tight">
          How to read: <span className="text-rose-400">Red cells</span> indicate a strong proxy relationship ({'>'}0.5) where the feature effectively "leaks" sensitive attribute information into the model, potentially bypassing fairness constraints.
        </div>
      </div>
    </div>
  );
}



