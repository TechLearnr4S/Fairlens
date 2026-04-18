import React, { useState, useEffect } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Legend
} from 'recharts';
import { Play, RotateCcw, ShieldAlert, Zap, TrendingUp, Info } from 'lucide-react';

export default function BiasSandbox() {
  const { jobId, simulation, setSimulation, isSimulating, setIsSimulating, columns, targetColumn, protectedAttributes } = useAuditStore();
  const [method, setMethod] = useState<'threshold_adjustment' | 'feature_removal'>('threshold_adjustment');
  const [threshold, setThreshold] = useState(0.5);
  
  // Filter out target and protected attributes from removable features
  const removableFeatures = React.useMemo(() => 
    columns.filter(col => col !== targetColumn && !protectedAttributes.includes(col)),
    [columns, targetColumn, protectedAttributes]
  );
  
  const [feature, setFeature] = useState(removableFeatures[0] || '');

  // Sync feature when removableFeatures change and current selection is no longer valid
  useEffect(() => {
    if (removableFeatures.length > 0 && !removableFeatures.includes(feature)) {
      setFeature(removableFeatures[0]);
    }
  }, [removableFeatures, feature]);

  const runSimulation = async () => {
    if (!jobId) return;
    
    setIsSimulating(true);
    try {
      const res = await fetch(`http://localhost:8000/audits/${jobId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          params: method === 'threshold_adjustment' 
            ? { threshold } 
            : { feature: feature || removableFeatures[0] }
        })
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error("Invalid response from simulation engine");
      }

      if (res.ok) {
        setSimulation(data);
      } else {
        alert(data.detail || "Simulation failed");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to connect to simulation engine.");
    } finally {
      setIsSimulating(false);
    }
  };

  const chartData = simulation ? [
    { name: 'Accuracy', before: simulation.before.accuracy, after: simulation.after.accuracy },
    { name: 'Selection Rate', before: simulation.before.selection_rate, after: simulation.after.selection_rate },
    { name: 'Disparity Score', before: simulation.before.disparity, after: simulation.after.disparity },
  ] : [];

  const disparityReductionPct = Number(simulation?.delta?.disparity_reduction_pct) || 0;
  const accuracyChangePct = Number(simulation?.delta?.accuracy_change_pct) || 0;
  const confidenceScore = Math.round((Number(simulation?.confidence) || 0) * 100);
  const afterDisparity = Number(simulation?.after?.disparity) || 0;
  const afterAccuracy = Number(simulation?.after?.accuracy) || 0;

  return (
    <div className="glass-panel p-8 bg-slate-900/40 border-slate-700/50 rounded-3xl overflow-hidden relative">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-3xl font-black text-white flex items-center gap-3">
            <Zap className="text-amber-400 fill-amber-400/20" size={32} />
            Bias Sandbox
          </h2>
          <p className="text-slate-400 text-sm mt-1">Simulate fairness mitigation strategies and audit trade-offs</p>
        </div>
        <div className="flex items-center gap-2">
            {simulation && (
               <button 
                 onClick={() => setSimulation(null)}
                 className="p-2 text-slate-400 hover:text-white transition-colors"
                 title="Reset Simulation"
               >
                 <RotateCcw size={20} />
               </button>
            )}
            <div className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-black uppercase tracking-widest">
              Enhanced Engine
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Controls Panel */}
        <div className="xl:col-span-1 space-y-6 bg-slate-800/20 p-6 rounded-2xl border border-slate-800">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mitigation Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
            >
              <option value="threshold_adjustment">Threshold Adjustment</option>
              <option value="feature_removal">Feature Removal</option>
            </select>
          </div>

          <div className={`space-y-4 transition-all duration-300 ${method !== 'threshold_adjustment' ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex justify-between">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Probability Threshold</label>
              <span className="text-indigo-400 font-mono font-bold">{threshold.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className={`space-y-2 transition-all duration-300 ${method !== 'feature_removal' ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Feature to Remove</label>
            <select
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
            >
              {removableFeatures.length > 0 ? (
                removableFeatures.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))
              ) : (
                <option value="" disabled>No removable features</option>
              )}
            </select>
          </div>

          <button
            onClick={runSimulation}
            disabled={isSimulating || (method === 'feature_removal' && removableFeatures.length === 0)}
            className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg ${
              isSimulating || (method === 'feature_removal' && removableFeatures.length === 0)
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/20'
            }`}
          >
            {isSimulating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Running Simulation...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span>Run Simulation</span>
              </>
            )}
          </button>
        </div>

        {/* Dashboard Panel */}
        <div className="xl:col-span-3 bg-slate-800/30 rounded-2xl border border-slate-800 p-8 min-h-[500px] flex flex-col relative overflow-hidden">
          {!simulation && !isSimulating && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 space-y-6 text-center max-w-sm mx-auto">
              <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center text-5xl opacity-20 border-2 border-slate-700">📊</div>
              <div className="space-y-2">
                <p className="text-lg font-bold text-slate-400 tracking-tight uppercase">Ready for Audit</p>
                <p className="text-sm font-medium leading-relaxed">Adjust model parameters to identify the optimal balance between predictive accuracy and algorithmic fairness.</p>
              </div>
            </div>
          )}

          {isSimulating && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <Zap className="text-indigo-400 animate-pulse" size={24} />
                </div>
              </div>
              <p className="text-slate-400 text-sm font-bold tracking-widest uppercase animate-pulse">Training Mitigation Model...</p>
            </div>
          )}

          {simulation && !isSimulating && (
            <div className="flex-1 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {/* Header Info */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div className="space-y-1">
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Mitigation Strategy Impact</h3>
                   <div className="flex items-center gap-3">
                      <span className="text-2xl font-black text-white">{disparityReductionPct.toFixed(1)}% Bias Reduction</span>
                      <TrendingUp className="text-emerald-400" size={20} />
                   </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-500 uppercase">Confidence Score</p>
                        <p className="text-lg font-mono font-black text-indigo-400">{confidenceScore}%</p>
                    </div>
                    <div className="w-px h-10 bg-slate-800" />
                    <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                        <ShieldAlert className="text-emerald-400" size={16} />
                        <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">Optimized</span>
                    </div>
                </div>
              </div>

              {/* Chart */}
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#475569" 
                      fontSize={11} 
                      fontWeight="bold"
                      tickLine={false} 
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="#475569" 
                      fontSize={11} 
                      fontWeight="bold"
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '16px', padding: '12px' }}
                      itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      cursor={{ fill: '#1e293b', opacity: 0.4 }}
                      formatter={(value: any) => `${(Number(value) * 100).toFixed(1)}%`}
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="right" 
                      iconType="circle" 
                      wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', paddingBottom: '30px' }} 
                    />
                    <Bar dataKey="before" name="Baseline" radius={[4, 4, 0, 0]} barSize={40}>
                      {(chartData || []).map((_entry: any, index: number) => (
                        <Cell key={`cell-before-${index}`} fill="#334155" />
                      ))}
                    </Bar>
                    <Bar dataKey="after" name="Simulated" radius={[4, 4, 0, 0]} barSize={40}>
                      {chartData.map((entry: any, index: number) => {
                        const isBetter = entry.name === 'Disparity Score' 
                          ? Number(entry.after) < Number(entry.before) 
                          : Number(entry.after) > Number(entry.before);
                        const isSame = Number(entry.after) === Number(entry.before);
                        return (
                          <Cell 
                            key={`cell-after-${index}`} 
                            fill={isSame ? '#3b82f6' : (isBetter ? '#10b981' : '#f43f5e')} 
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* AI Insight Summary */}
              <div className="p-5 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex gap-4 items-start">
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                    <Info size={20} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">AI Mitigation Insight</h4>
                    <p className="text-slate-300 text-sm leading-relaxed font-medium italic">
                      "{simulation.insight}"
                    </p>
                  </div>
              </div>

              {/* Delta Cards */}
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Disparity Gap</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-black text-white">{(afterDisparity * 100).toFixed(1)}%</span>
                        <div className={`px-2 py-0.5 rounded-md text-[10px] font-black ${disparityReductionPct > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                           {disparityReductionPct > 0 ? `↓ ${disparityReductionPct}% Reduction` : 'No change'}
                        </div>
                      </div>
                  </div>
                  <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Accuracy Trade-off</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-black text-white">{(afterAccuracy * 100).toFixed(1)}%</span>
                        <div className={`px-2 py-0.5 rounded-md text-[10px] font-black ${accuracyChangePct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                           {accuracyChangePct >= 0 ? `↑ ${accuracyChangePct}%` : `↓ ${Math.abs(accuracyChangePct)}%`}
                        </div>
                      </div>
                  </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
