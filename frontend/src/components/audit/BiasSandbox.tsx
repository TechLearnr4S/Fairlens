import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { useAuditProgressStore } from '../../store/auditProgressStore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Legend,
  Line,
  ReferenceDot,
  ComposedChart,
  Label,
  AreaChart,
  Area
} from 'recharts';
import { Play, RotateCcw, ShieldAlert, Zap, TrendingUp, TrendingDown, Info, AlertCircle } from 'lucide-react';
import { useToast } from '../providers/ToastProvider';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { AuditEmptyState } from '../ui/AuditEmptyState';

export default function BiasSandbox() {
  const { addToast } = useToast();
  const { jobId, simulation, setSimulation, isSimulating, setIsSimulating, columns, targetColumn, protectedAttributes } = useAuditStore();
  const advanceTo = useAuditProgressStore((state) => state.advanceTo);
  const [method, setMethod] = useState<'threshold_adjustment' | 'feature_removal' | 'reweighing'>('threshold_adjustment');
  const [threshold, setThreshold] = useState(0.5);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [tradeoffCurve, setTradeoffCurve] = useState<any[]>([]);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [simulationMessage, setSimulationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
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

  const runSimulation = useCallback(async () => {
    if (!jobId) return;
    
    // Abort previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new controller for the current request
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setIsSimulating(true);
    setSimulationMessage(null);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          method,
          params: method === 'threshold_adjustment'
            ? { threshold }
            : method === 'feature_removal'
            ? { feature: feature || removableFeatures[0] }
            : {} // reweighing computes weights internally
        })
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        if (controller.signal.aborted) return;
        throw new Error("Invalid response from simulation engine");
      }

      if (res.ok) {
        if (controller.signal.aborted) return;
        setSimulation(data);
        advanceTo(5, jobId);
        setSimulationMessage({
          type: 'success',
          text: 'Simulation complete. Review the before/after impact and decision step.',
        });
      } else {
        if (controller.signal.aborted) return;
        const message = data.detail || "Simulation failed";
        setSimulationMessage({ type: 'error', text: message });
        addToast(message, 'error');
      }
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err.name === 'AbortError') return;
      if (isRequestTimeout(e)) {
        setSimulationMessage({ type: 'error', text: 'Simulation timed out. Try again after confirming the API is running.' });
        return;
      }
      console.error(e);
      setSimulationMessage({ type: 'error', text: 'Failed to connect to simulation engine.' });
      addToast("Failed to connect to simulation engine.", 'error');
    } finally {
      // Only release simulation lock if this was the latest request
      if (abortControllerRef.current === controller) {
        setIsSimulating(false);
      }
    }
  }, [jobId, method, threshold, feature, removableFeatures, setIsSimulating, setSimulation, advanceTo, addToast]);

  const runSimulationRef = useRef(runSimulation);
  runSimulationRef.current = runSimulation;

  const handleOptimize = async () => {
    if (!jobId) return;
    setIsOptimizing(true);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/optimize`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setThreshold(data.optimal_threshold);
        setTradeoffCurve(data.tradeoff_curve);
        addToast(`Optimized threshold found: ${data.optimal_threshold}`, 'success');
      } else {
        addToast(data.detail || "Optimization failed", 'error');
      }
    } catch (e) {
      if (isRequestTimeout(e)) return;
      addToast("Failed to connect to optimization engine", 'error');
    } finally {
      setIsOptimizing(false);
      fetchRecommendation();
    }
  };

  const fetchRecommendation = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/recommendation`);
      const data = await res.json();
      if (res.ok) setRecommendation(data);
    } catch (e) {
      if (!isRequestTimeout(e)) console.error("Failed to fetch recommendation", e);
    }
  }, [jobId]);

  useEffect(() => {
    if (jobId && simulation) {
      fetchRecommendation();
    }
  }, [jobId, simulation, fetchRecommendation]);

  // Debounced simulation trigger — keep runSimulation off deps to avoid loops when callback identity churns.
  useEffect(() => {
    if (!jobId) return;

    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setIsDebouncing(false);
      void runSimulationRef.current();
    }, 400);

    return () => {
      clearTimeout(timer);
      setIsDebouncing(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [method, threshold, feature, jobId]);

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

  if (!jobId) {
    return (
      <AuditEmptyState
        variant="no-audit"
        title="Bias Sandbox"
        description="Run an audit so we know your dataset and job id. Then you can simulate mitigation strategies."
        compact
        className="glass-panel rounded-3xl border-slate-700/50"
      />
    );
  }

  if (!targetColumn) {
    return (
      <AuditEmptyState
        variant="missing-data"
        title="Outcome column required"
        description="Simulations need the prediction or decision column from your audit (the same field you chose as the target). Complete that step in the wizard, run the audit, then open the sandbox again."
        compact
        cta={{ label: 'Open audit setup', to: '/new-audit' }}
        className="glass-panel rounded-3xl border-slate-700/50"
      />
    );
  }

  if (columns.length === 0) {
    return (
      <AuditEmptyState
        variant="missing-data"
        title="No dataset columns in session"
        description="We don’t have column metadata for this job. Start a new audit from a CSV upload so the sandbox can build feature lists and mitigation options."
        compact
        cta={{ label: 'Upload dataset', to: '/new-audit' }}
        className="glass-panel rounded-3xl border-slate-700/50"
      />
    );
  }

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
        <div className="flex items-center gap-4">
            {isDebouncing && (
              <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Debouncing...</span>
              </div>
            )}
            {!isDebouncing && !isSimulating && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live Sync</span>
              </div>
            )}
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

      {simulationMessage && (
        <div
          role="status"
          className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${
            simulationMessage.type === 'success'
              ? 'border-[#10B981]/30 bg-[#10B981]/10 text-emerald-100'
              : 'border-[#EF4444]/30 bg-[#EF4444]/10 text-rose-100'
          }`}
        >
          {simulationMessage.type === 'success' ? (
            <TrendingUp size={18} className="mt-0.5 shrink-0 text-[#10B981]" />
          ) : (
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#EF4444]" />
          )}
          <span>{simulationMessage.text}</span>
        </div>
      )}

      {isSimulating && !simulation && (
        <div className="mb-6 rounded-2xl border border-white/[0.08] bg-[#111827] p-5" aria-busy="true">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-700/80" />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="h-20 animate-pulse rounded-xl bg-slate-800/80" />
            <div className="h-20 animate-pulse rounded-xl bg-slate-800/80" />
            <div className="h-20 animate-pulse rounded-xl bg-slate-800/80" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Controls Panel */}
        <div className="xl:col-span-1 space-y-6 bg-slate-800/20 p-6 rounded-2xl border border-slate-800">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mitigation Method</label>
            <select
              value={method}
              disabled={isSimulating}
              onChange={(e) => setMethod(e.target.value as any)}
              className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer ${isSimulating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="threshold_adjustment">Threshold Adjustment (Post-processing)</option>
              <option value="reweighing">Reweighing (Pre-processing)</option>
              <option value="feature_removal">Feature Removal (Pre-processing)</option>
            </select>
          </div>

          {/* Reweighing info panel */}
          {method === 'reweighing' && (
            <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl space-y-2">
              <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Pre-processing · Reweighing</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rebalances sample weights using the formula <span className="font-mono text-teal-300">w = P(Y)×P(A)/P(Y,A)</span> so every group–outcome pair is equally represented before training.
              </p>
              <p className="text-[10px] text-slate-500 italic">No parameters required — click Run to apply.</p>
            </div>
          )}

          <div className={`space-y-4 transition-all duration-300 ${method !== 'threshold_adjustment' ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Threshold: <span className="text-indigo-400">{threshold.toFixed(2)}</span></label>
              <button 
                onClick={handleOptimize}
                disabled={isOptimizing || isSimulating}
                className={`text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-500/5 border border-indigo-500/10 ${isOptimizing ? 'animate-pulse' : ''}`}
              >
                {isOptimizing ? <RotateCcw size={10} className="animate-spin" /> : <Zap size={10} className="fill-indigo-400/20" />}
                Auto Optimize
              </button>
            </div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Live Update</span>
                <div className={`w-1 h-1 rounded-full ${isDebouncing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              </div>
              {threshold === 0.5 && !isSimulating && (
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Default Baseline</span>
              )}
            </div>
            <input
              type="range" min="0.1" max="0.9" step="0.05"
              value={threshold}
              disabled={isSimulating || isOptimizing}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 ${isSimulating || isOptimizing ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            
            {/* Mini Sensitivity Graph */}
            {tradeoffCurve.length > 0 && method === 'threshold_adjustment' && (
              <div className="h-16 w-full mt-4 bg-slate-900/40 rounded-lg overflow-hidden border border-slate-700/30 group relative">
                <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Bias Sensitivity</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tradeoffCurve}>
                    <Area 
                      type="monotone" 
                      dataKey="disparity" 
                      stroke="#6366f1" 
                      fill="url(#colorDisp)" 
                      strokeWidth={2} 
                      isAnimationActive={false} 
                    />
                    <defs>
                      <linearGradient id="colorDisp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    {/* Highlight Current Threshold */}
                    {tradeoffCurve.find(p => Math.abs(p.threshold - threshold) < 0.01) && (
                       <ReferenceDot 
                         x={tradeoffCurve.indexOf(tradeoffCurve.find(p => Math.abs(p.threshold - threshold) < 0.01))} 
                         y={tradeoffCurve.find(p => Math.abs(p.threshold - threshold) < 0.01).disparity} 
                         r={3} 
                         fill="#f59e0b" 
                         stroke="#fff" 
                         strokeWidth={1}
                       />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className={`space-y-2 transition-all duration-300 ${method !== 'feature_removal' ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Feature to Remove</label>
            <select
              value={feature}
              disabled={isSimulating}
              onChange={(e) => setFeature(e.target.value)}
              className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none ${isSimulating ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                <span>Manual Simulation Sync</span>
              </>
            )}
          </button>
        </div>

        {/* Dashboard Panel */}
        <div id="simulation-sandbox" className="xl:col-span-3 bg-slate-800/30 rounded-2xl border border-slate-800 p-8 min-h-[500px] flex flex-col relative overflow-hidden">
          {/* Decision Intelligence Engine */}
          {recommendation && recommendation.recommendations && simulation && (
            <div className="mb-10 space-y-6 animate-in fade-in slide-in-from-top-4 duration-700">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="text-indigo-400" size={16} fill="currentColor" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Decision Intelligence Engine</h3>
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                    {recommendation.recommendations.length} Strategy Scenarios Evaluated
                  </span>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {recommendation.recommendations.map((rec: any, i: number) => {
                    const isRecommended = rec.label === recommendation.recommended;
                    return (
                      <div 
                        key={i} 
                        className={`relative p-8 rounded-[2rem] border transition-all duration-500 group ${
                          isRecommended 
                            ? 'bg-gradient-to-br from-indigo-600/20 to-violet-600/20 border-indigo-500/50 shadow-2xl shadow-indigo-500/10' 
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {isRecommended && (
                          <div className="absolute -top-3 left-8 px-4 py-1.5 bg-indigo-500 text-[10px] font-black text-white uppercase tracking-widest rounded-full shadow-lg shadow-indigo-500/20">
                            AI Recommended
                          </div>
                        )}
                        <div className="space-y-6">
                           <div>
                             <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isRecommended ? 'text-indigo-400' : 'text-slate-500'}`}>
                               {rec.label}
                             </p>
                             <h4 className="text-lg font-black text-white leading-tight">
                               {rec.action}
                             </h4>
                           </div>
                           
                           <div className="space-y-4">
                              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                                {rec.impact}
                              </p>
                              <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/5">
                                 <div className="flex flex-col">
                                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Confidence</span>
                                   <span className="text-sm font-mono font-black text-emerald-400">{(rec.confidence * 100).toFixed(0)}%</span>
                                 </div>
                                 <button 
                                   onClick={() => {
                                     setThreshold(rec.threshold);
                                     addToast(`Applying ${rec.label} strategy...`, 'info');
                                   }}
                                   className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                     isRecommended 
                                       ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-xl shadow-indigo-500/20 active:scale-95' 
                                       : 'bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95'
                                   }`}
                                 >
                                   Apply
                                 </button>
                              </div>
                           </div>
                        </div>
                      </div>
                    )
                  })}
               </div>
            </div>
          )}

          {!simulation && !isSimulating && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 space-y-6 text-center max-w-sm mx-auto">
              <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center text-5xl opacity-20 border-2 border-slate-700">📊</div>
              <div className="space-y-2">
                <p className="text-lg font-bold text-slate-400 tracking-tight uppercase">Ready for Audit</p>
                <p className="text-sm font-medium leading-relaxed">Adjust model parameters to identify the optimal balance between predictive accuracy and algorithmic fairness.</p>
              </div>
            </div>
          )}

          {!simulation && isSimulating && (
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

          {simulation && (
            <div className={`flex-1 space-y-10 transition-all duration-700 ease-out ${isSimulating ? 'opacity-40 grayscale-[0.8] blur-[2px] scale-[0.995]' : 'opacity-100 scale-100'}`}>
              {/* Updating Overlay */}
              {isSimulating && (
                <div className="absolute top-6 right-6 z-30 flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl border border-indigo-500/40 px-5 py-2.5 rounded-2xl shadow-2xl animate-in fade-in zoom-in slide-in-from-top-2 duration-300 ring-1 ring-white/10">
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                  </div>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Live Updating...</span>
                </div>
              )}
              {/* Header Info */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Mitigation Strategy Impact</h3>
                    <div className="flex items-center gap-3">
                       <span className="text-2xl font-black text-white">{disparityReductionPct.toFixed(1)}% Bias Reduction</span>
                       {disparityReductionPct > 0 ? (
                         <TrendingDown className="text-emerald-400" size={20} />
                       ) : (
                         <TrendingUp className="text-rose-400" size={20} />
                       )}
                    </div>
                    <div className="flex gap-2 mt-1">
                       {disparityReductionPct > 0 && (
                         <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                           <Zap size={10} />
                           Bias decreasing
                         </div>
                       )}
                       {accuracyChangePct < 0 && (
                         <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[9px] font-black text-amber-400 uppercase tracking-wider">
                           <AlertCircle size={10} />
                           Trade-off increasing
                         </div>
                       )}
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
                      domain={[0, 1]}
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
                    <Bar dataKey="before" name="Baseline" radius={[4, 4, 0, 0]} barSize={40} isAnimationActive={true} animationDuration={800} animationEasing="ease-in-out">
                      {(chartData || []).map((_entry: any, index: number) => (
                        <Cell key={`cell-before-${index}`} fill="#334155" />
                      ))}
                    </Bar>
                    <Bar dataKey="after" name="Simulated" radius={[4, 4, 0, 0]} barSize={40} isAnimationActive={true} animationDuration={800} animationEasing="ease-in-out">
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

              {/* Insight Section */}
              <div className="bg-indigo-500/5 border border-indigo-500/10 p-5 rounded-2xl flex items-start gap-4 animate-in fade-in slide-in-from-left-2 duration-500">
                  <div className="mt-1 bg-indigo-500/20 p-2 rounded-lg shrink-0">
                    <Info className="text-indigo-400" size={18} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Intelligent Simulation Insight</p>
                    <p className="text-sm text-slate-300 leading-relaxed font-medium italic">
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

              {/* Tradeoff Curve Section */}
              {tradeoffCurve.length > 0 && (
                <div className="pt-8 border-t border-slate-800 space-y-6">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Fairness vs Accuracy Pareto Curve</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Visualization of the mathematical trade-off across the threshold spectrum (0.1 - 0.9)</p>
                  </div>
                  
                  <div className="h-[250px] w-full bg-slate-900/20 rounded-2xl p-4 border border-slate-800/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={tradeoffCurve} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                        <XAxis 
                          dataKey="disparity" 
                          name="Disparity" 
                          stroke="#475569" 
                          fontSize={10} 
                          type="number" 
                          domain={[0, 'dataMax + 0.05']}
                          label={{ value: 'Disparity (Lower is Better)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#475569', fontWeight: 'bold' }}
                        />
                        <YAxis 
                          dataKey="accuracy" 
                          name="Accuracy" 
                          stroke="#475569" 
                          fontSize={10} 
                          domain={['dataMin - 0.05', 1]}
                          label={{ value: 'Accuracy', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#475569', fontWeight: 'bold' }}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '10px' }}
                          formatter={(value: any, name: unknown) => [typeof value === 'number' && String(name) !== 'threshold' ? `${(value * 100).toFixed(1)}%` : String(value), String(name)]}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="accuracy" 
                          stroke="#6366f1" 
                          strokeWidth={2} 
                          dot={{ r: 2, fill: '#6366f1' }} 
                          activeDot={{ r: 5 }}
                          animationDuration={1500}
                        />
                        {/* Current Threshold Point */}
                        {tradeoffCurve.find(p => Math.abs(p.threshold - threshold) < 0.01) && (
                          <ReferenceDot 
                            x={tradeoffCurve.find(p => Math.abs(p.threshold - threshold) < 0.01).disparity} 
                            y={tradeoffCurve.find(p => Math.abs(p.threshold - threshold) < 0.01).accuracy} 
                            r={6} 
                            fill="#f59e0b" 
                            stroke="#fff" 
                            strokeWidth={2}
                          >
                            <Label value="Current" position="top" fill="#f59e0b" fontSize={9} fontWeight="bold" offset={10} />
                          </ReferenceDot>
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


