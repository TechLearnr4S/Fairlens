import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { 
  Target, Activity, CheckCircle2, AlertCircle, Loader2, 
  TrendingDown, Info, ShieldAlert, ShieldCheck,
  Scale, Gauge, HelpCircle, Layers, Fingerprint,
  Zap, MessageSquare, History, BarChart2, LineChart as LucideLineChart,
  ShieldQuestion, ChevronRight
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip, Cell, Legend, CartesianGrid, LineChart, Line,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

export const ModelEvaluator: React.FC = () => {
  const { jobId, columns } = useAuditStore();
  
  const [yTrue, setYTrue] = useState<string>('');
  const [yPred, setYPred] = useState<string>('');
  const [probsCol, setProbsCol] = useState<string>('');
  const [selectedAttrs, setSelectedAttrs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'metrics' | 'significance' | 'calibration' | 'policy'>('metrics');
  const [results, setResults] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAttr = (col: string) => {
    setSelectedAttrs(prev => 
      prev.includes(col) ? prev.filter(a => a !== col) : [...prev, col]
    );
  };

  const runEvaluation = async () => {
    if (!jobId || !yTrue || !yPred || selectedAttrs.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8000/audits/${jobId}/model-evaluation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          y_true_col: yTrue,
          y_pred_col: yPred,
          protected_attribute_cols: selectedAttrs,
          probs_col: probsCol || null,
          policy: {
            max_disparity: 0.1,
            min_accuracy: 0.8,
            alpha: 0.05
          }
        })
      });
      const data = await res.json();
      if (res.ok) setResults(data);
      else setError(data.detail || 'Evaluation failed');
    } catch (err) {
      setError('Connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approve': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'Conditional': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'Reject': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const chartData = results?.groups ? Object.entries(results.groups).map(([name, data]: [string, any]) => ({
    name,
    tpr: data.metrics.tpr * 100,
    fpr: data.metrics.fpr * 100,
    accuracy: data.metrics.accuracy * 100,
    size: data.metrics.size
  })) : [];

  return (
    <div className="glass-panel p-8 space-y-10 animate-in fade-in duration-700">
      {/* Policy-First Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
             <Fingerprint size={32} className="text-primary-400" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white tracking-tight">Enterprise Fairness Auditor</h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
               Statistically Rigorous · Policy-Enforced · Auditable
            </p>
          </div>
        </div>

        {results && (
          <div className="flex items-center gap-4 bg-dark-900/50 p-2 rounded-2xl border border-slate-800">
             <div className="px-6 py-2 border-r border-slate-800 text-center">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Decision</p>
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${getStatusColor(results.decision.status)}`}>
                   {results.decision.status}
                </span>
             </div>
             <div className="px-6 py-2 text-center">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Audit Confidence</p>
                <p className="text-xl font-black text-white">{(1 - results.metadata.alpha) * 100}%</p>
             </div>
          </div>
        )}
      </div>

      {/* Advanced Selection */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 p-6 bg-slate-900/40 rounded-3xl border border-slate-800/50">
        <div className="space-y-4">
           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Mapping</label>
           <div className="grid grid-cols-1 gap-2">
              <select value={yTrue} onChange={(e) => setYTrue(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white">
                <option value="">Select y_true</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={yPred} onChange={(e) => setYPred(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white">
                <option value="">Select y_pred</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
           </div>
        </div>

        <div className="space-y-4">
           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Risk Model (Optional)</label>
           <select value={probsCol} onChange={(e) => setProbsCol(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white">
             <option value="">Select Probs Column</option>
             {columns.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
           <p className="text-[9px] text-slate-500 italic">Required for Calibration & Pareto analysis.</p>
        </div>

        <div className="xl:col-span-2 space-y-4">
           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Audit Dimensions</label>
           <div className="flex flex-wrap gap-2">
              {columns.map(c => (
                <button 
                  key={c}
                  onClick={() => toggleAttr(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                    selectedAttrs.includes(c) 
                    ? 'bg-primary-600 border-primary-500 text-white shadow-lg shadow-primary-500/20' 
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {c}
                </button>
              ))}
           </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={runEvaluation}
          disabled={isLoading || !yTrue || !yPred || selectedAttrs.length === 0}
          className={`flex items-center gap-3 px-12 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
            isLoading 
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
            : 'bg-primary-600 hover:bg-primary-500 text-white shadow-xl shadow-primary-500/20 active:scale-95'
          }`}
        >
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
          <span>{isLoading ? 'Bootstrapping CIs...' : 'Execute Formal Audit'}</span>
        </button>
      </div>

      {results && (
        <div className="space-y-8 animate-in fade-in duration-1000">
          {/* Internal Navigation */}
          <div className="flex items-center gap-6 border-b border-slate-800 overflow-x-auto pb-px scrollbar-hide">
            {[
              { id: 'metrics', label: 'Metrics & Gaps', icon: <Scale size={14} /> },
              { id: 'significance', label: 'Significance & CIs', icon: <Info size={14} /> },
              { id: 'calibration', label: 'Calibration & Pareto', icon: <LucideLineChart size={14} /> },
              { id: 'policy', label: 'Policy Enforcement', icon: <ShieldAlert size={14} /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${
                  activeTab === tab.id ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.icon} {tab.label}
                {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
             {activeTab === 'metrics' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   <div className="glass-panel p-6 space-y-6">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Equality of Opportunity (TPR)</h4>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                               <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                               <YAxis domain={[0, 100]} hide />
                               <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
                               <Bar dataKey="tpr" radius={[6, 6, 0, 0]} barSize={40}>
                                  {chartData.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={entry.tpr > 80 ? '#10b981' : entry.tpr > 60 ? '#f59e0b' : '#f43f5e'} />
                                  ))}
                               </Bar>
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                   </div>

                   <div className="glass-panel p-6 space-y-6">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Disparity Overview</h4>
                      <div className="space-y-4">
                         {Object.entries(results.disparities).map(([key, val]: [string, any]) => (
                            <div key={key} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800">
                               <div className="flex justify-between items-end mb-2">
                                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{key.replace('_', ' ')}</p>
                                  <p className="text-xl font-black text-white">{(val * 100).toFixed(1)}%</p>
                               </div>
                               <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${val > 0.1 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${val * 100}%` }} />
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>
             )}

             {activeTab === 'significance' && (
                <div className="glass-panel overflow-hidden border-slate-800">
                   <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/60">
                         <tr>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Subgroup</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">TPR Difference</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">p-value</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Significance</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                         {Object.entries(results.significance).map(([name, data]: [string, any]) => (
                            <tr key={name} className="hover:bg-slate-800/20 transition-colors">
                               <td className="px-6 py-4 font-bold text-white capitalize">{name}</td>
                               <td className="px-6 py-4 font-mono text-slate-400">
                                  {results.groups[name].metrics.tpr.toFixed(3)} vs {results.groups[data.vs_reference].metrics.tpr.toFixed(3)}
                               </td>
                               <td className="px-6 py-4 font-mono text-primary-400">{data.tpr_p_value.toFixed(4)}</td>
                               <td className="px-6 py-4">
                                  {data.is_significant ? (
                                     <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[9px] font-black uppercase rounded border border-rose-500/30 flex items-center gap-1 w-fit">
                                        <ShieldAlert size={10} /> Significant Bias
                                     </span>
                                  ) : (
                                     <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase rounded border border-emerald-500/30 flex items-center gap-1 w-fit">
                                        <CheckCircle2 size={10} /> Non-Significant
                                     </span>
                                  )}
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             )}

             {activeTab === 'calibration' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   <div className="glass-panel p-6 space-y-6">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Pareto Front (Accuracy vs Disparity)</h4>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                               <XAxis type="number" dataKey="disparity" name="Disparity" unit="%" tick={{fill: '#64748b', fontSize: 10}} />
                               <YAxis type="number" dataKey="accuracy" name="Accuracy" unit="%" tick={{fill: '#64748b', fontSize: 10}} />
                               <ZAxis type="number" dataKey="threshold" name="Threshold" />
                               <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                               <Scatter name="Thresholds" data={results.pareto.map((p:any)=>({...p, accuracy: p.accuracy*100, disparity: p.disparity*100}))} fill="#6366f1" />
                            </ScatterChart>
                         </ResponsiveContainer>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center italic">Each dot represents a potential decision threshold mapping.</p>
                   </div>

                   <div className="glass-panel p-6 space-y-6">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Calibration Curve</h4>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={results.calibration.reliability_curve.accuracy.map((acc: number, i: number) => ({
                               acc: acc * 100,
                               conf: results.calibration.reliability_curve.confidence[i] * 100
                            }))}>
                               <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                               <XAxis dataKey="conf" hide />
                               <YAxis hide domain={[0, 100]} />
                               <Tooltip />
                               <Line type="monotone" dataKey="acc" stroke="#10b981" strokeWidth={2} dot={{fill: '#10b981'}} />
                               <Line type="monotone" dataKey="conf" stroke="#64748b" strokeDasharray="5 5" />
                            </LineChart>
                         </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between items-center bg-slate-900/40 p-3 rounded-xl">
                         <span className="text-[10px] font-black text-slate-500 uppercase">Expected Calibration Error</span>
                         <span className="text-sm font-black text-white">{results.calibration.ece.toFixed(4)}</span>
                      </div>
                   </div>
                </div>
             )}

             {activeTab === 'policy' && (
                <div className="space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="glass-panel p-6 space-y-4">
                         <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={14} className="text-emerald-500" /> Active Decision Policy
                         </h4>
                         <div className="space-y-2">
                            {Object.entries(results.decision.policy_applied).map(([key, val]: [string, any]) => (
                               <div key={key} className="flex justify-between text-xs py-2 border-b border-slate-800 last:border-0">
                                  <span className="text-slate-500 capitalize">{key.replace('_', ' ')}</span>
                                  <span className="font-bold text-white">{typeof val === 'number' ? val.toFixed(3) : val}</span>
                               </div>
                            ))}
                         </div>
                      </div>

                      <div className="glass-panel p-6 space-y-4">
                         <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <ShieldAlert size={14} className="text-rose-500" /> Violations Detected
                         </h4>
                         <div className="space-y-3">
                            {results.decision.violations.length > 0 ? (
                               results.decision.violations.map((v: string, i: number) => (
                                  <div key={i} className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl text-xs font-bold text-rose-300 flex items-start gap-3">
                                     <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                     {v}
                                  </div>
                               ))
                            ) : (
                               <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-xs font-bold text-emerald-300 flex items-start gap-3">
                                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                                  All policy constraints satisfied.
                               </div>
                            )}
                         </div>
                      </div>
                   </div>

                   <div className="glass-panel p-8 bg-indigo-500/5 border-indigo-500/20">
                      <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4">Verifiable Auditor Insights</h4>
                      <div className="space-y-3">
                         {results.insights.map((insight: string, i: number) => (
                            <div key={i} className="flex items-center gap-3 text-sm text-slate-300 leading-relaxed">
                               <ChevronRight size={14} className="text-indigo-500 shrink-0" />
                               {insight}
                            </div>
                         ))}
                      </div>
                   </div>
                </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};
