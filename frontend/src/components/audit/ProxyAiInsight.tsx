import { useState } from 'react';
import { Sparkles, AlertTriangle, ShieldCheck, Zap, Info, ListTodo } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { AuditEmptyState } from '../ui/AuditEmptyState';

export default function ProxyAiInsight() {
  const { 
    jobId, 
    proxyAiInsight, 
    isExplainingProxy, 
    setProxyAiInsight, 
    setIsExplainingProxy,
    proxyRisks
  } = useAuditStore();

  const [explainError, setExplainError] = useState(false);

  const handleExplain = async () => {
    if (!jobId) return;
    setExplainError(false);
    setIsExplainingProxy(true);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/proxy-explain`, {
        method: 'POST'
      });
      const data = await res.json();
      setProxyAiInsight(data);
    } catch (err) {
      console.error("AI Insight failed:", err);
      if (!isRequestTimeout(err)) setExplainError(true);
    } finally {
      setIsExplainingProxy(false);
    }
  };

  const highlightContent = (text: string) => {
    if (!text) return text;
    
    // Create a regex of feature names and key phrases
    const featureNames = proxyRisks.map(r => r.feature);
    const keywords = [...featureNames, "high risk", "medium risk", "low risk", "bias", "proxy", "discrimination"];
    
    // Sort by length longest first to avoid partial matches
    keywords.sort((a, b) => b.length - a.length);
    
    const regex = new RegExp(`(${keywords.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => {
      const isKeyword = keywords.some(k => k.toLowerCase() === part.toLowerCase());
      if (isKeyword) {
        return (
          <span key={i} className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (!jobId) {
    return (
      <AuditEmptyState
        variant="no-audit"
        title="Proxy AI insight"
        description="An active audit job is required to explain proxy risk patterns."
        compact
        className="glass-panel border-rose-500/15"
      />
    );
  }

  if (explainError && !proxyAiInsight && !isExplainingProxy) {
    return (
      <AuditEmptyState
        variant="failed-api"
        title="Could not generate proxy explanation"
        description="The AI explanation service failed. Retry once the API is healthy."
        onRetry={handleExplain}
        retryLabel="Retry explanation"
        compact
        className="glass-panel border-rose-500/15"
      />
    );
  }

  if (!proxyAiInsight && !isExplainingProxy) {
    return (
      <div className="glass-panel p-8 text-center bg-gradient-to-br from-rose-500/5 to-orange-500/5 border-rose-500/20">
        <Sparkles className="mx-auto text-rose-400 mb-4" size={40} />
        <h3 className="text-xl font-bold text-white mb-2">Understand Proxy Patterns</h3>
        <p className="text-slate-400 mb-6 max-w-lg mx-auto">
          Use the AI Auditor to decode why specific features were flagged as proxies and understand the regulatory risks of indirect discrimination.
        </p>
        <button 
          onClick={handleExplain}
          className="px-6 py-3 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white rounded-xl font-bold shadow-lg shadow-rose-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
        >
          <Zap size={18} />
          Explain Proxy Bias
        </button>
      </div>
    );
  }

  if (isExplainingProxy) {
    return (
      <div className="glass-panel p-12 flex flex-col items-center justify-center space-y-4 border-rose-500/30">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
          <Sparkles className="absolute inset-0 m-auto text-rose-400 animate-pulse" size={24} />
        </div>
        <p className="text-rose-300 font-medium animate-pulse text-center">
          Generating insights...
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden border-rose-500/30 bg-gradient-to-br from-dark-800 to-rose-950/20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="p-6 border-b border-rose-500/20 bg-rose-500/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400 border border-rose-500/30">
            <Sparkles size={20} />
          </div>
          <h3 className="text-xl font-bold text-white">AI Insight</h3>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">
             Gemini 2.0 Enabled
           </span>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {typeof proxyAiInsight === 'string' ? (
          <div className="space-y-6">
            <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-2xl">
              <div className="text-slate-200 leading-relaxed whitespace-pre-wrap text-sm">
                {highlightContent(proxyAiInsight)}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 italic">
              <Info size={14} />
              <span>Contextually generated based on your specific dataset correlations.</span>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-xl">
              <p className="text-lg text-slate-200 leading-relaxed italic">
                "{proxyAiInsight.summary || 'Proxy risk narrative generated.'}"
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
                  <AlertTriangle size={16} className="text-rose-400" />
                  Surrogate Features
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(proxyAiInsight.risky_features || []).map((feature: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-dark-900 border border-rose-500/30 text-rose-300 rounded-full text-xs font-bold shadow-inner">
                      {feature}
                    </span>
                  ))}
                </div>
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap mt-2">
                  {highlightContent(proxyAiInsight.narrative || '')}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
                    <ShieldCheck size={16} className="text-primary-400" />
                    Compliance Implication
                  </h4>
                  <p className="text-slate-300 text-sm leading-relaxed p-4 bg-primary-500/5 rounded-xl border border-primary-500/20">
                    {highlightContent(proxyAiInsight.implications || '')}
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
                    <ListTodo size={16} className="text-emerald-400" />
                    Mitigation Strategy
                  </h4>
                  <ul className="space-y-3">
                    {(proxyAiInsight.actions || []).map((action: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20 text-slate-300 text-xs">
                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-lg shadow-emerald-500/50" />
                        {highlightContent(action)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
