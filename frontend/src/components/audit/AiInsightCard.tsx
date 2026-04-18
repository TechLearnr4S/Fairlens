import React from 'react';
import { Sparkles, AlertCircle, HelpCircle, Activity, Lightbulb } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';

export default function AiInsightCard() {
  const { jobId, aiInsight, isExplaining, setIsExplaining, setAiInsight } = useAuditStore();

  const handleExplain = async () => {
    if (!jobId) return;
    setIsExplaining(true);
    try {
      const res = await fetch(`http://localhost:8000/audits/${jobId}/explain`, {
        method: 'POST'
      });
      const data = await res.json();
      setAiInsight(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExplaining(false);
    }
  };

  if (!aiInsight && !isExplaining) {
    return (
      <div className="glass-panel p-8 text-center bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-indigo-500/20">
        <Sparkles className="mx-auto text-indigo-400 mb-4" size={40} />
        <h3 className="text-xl font-bold text-white mb-2">Generate AI Insight</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Use Gemini to decode the algorithmic patterns in your data and understand the real-world impact of detected disparities.
        </p>
        <button 
          onClick={handleExplain}
          className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
        >
          Explain Bias Patterns
        </button>
      </div>
    );
  }

  if (isExplaining) {
    return (
      <div className="glass-panel p-12 flex flex-col items-center justify-center space-y-4 border-indigo-500/30">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <Sparkles className="absolute inset-0 m-auto text-indigo-400 animate-pulse" size={24} />
        </div>
        <p className="text-indigo-300 font-medium animate-pulse">Gemini is analyzing audit logs...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden border-indigo-500/30 bg-gradient-to-br from-dark-800 to-indigo-950/20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="p-6 border-b border-indigo-500/20 bg-indigo-500/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Sparkles size={20} />
          </div>
          <h3 className="text-xl font-bold text-white">AI Studio Insight</h3>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
          Gemini 2.0 Enabled
        </span>
      </div>

      <div className="p-8 space-y-8">
        <div className="space-y-3">
          <p className="text-lg text-slate-200 leading-relaxed italic">
            "{aiInsight.summary}"
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Bias Locations */}
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
              <AlertCircle size={16} className="text-rose-400" />
              Bias Hotspots
            </h4>
            <ul className="space-y-2">
              {aiInsight.bias_locations.map((loc: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-slate-300">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {loc}
                </li>
              ))}
            </ul>
          </div>

          {/* Root Causes */}
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
              <HelpCircle size={16} className="text-amber-400" />
              Potential Root Causes
            </h4>
            <ul className="space-y-2">
              {aiInsight.root_causes.map((cause: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-slate-300">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {cause}
                </li>
              ))}
            </ul>
          </div>

          {/* Real World Impact */}
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
              <Activity size={16} className="text-primary-400" />
              Real-World Impact
            </h4>
            <p className="text-slate-300 leading-relaxed">
              {aiInsight.impact}
            </p>
          </div>

          {/* Recommendations */}
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
              <Lightbulb size={16} className="text-emerald-400" />
              AI Recommendations
            </h4>
            <ul className="space-y-2">
              {aiInsight.recommendations.map((rec: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-slate-300">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
