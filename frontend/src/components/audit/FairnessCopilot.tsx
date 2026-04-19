import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  FileText, 
  Loader, 
  CheckCircle2, 
  ChevronRight,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';

const AGENTS = [
  { id: 'auditor', name: 'Auditor Agent', icon: ShieldCheck, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  { id: 'explainer', name: 'Explainer Agent', icon: Sparkles, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  { id: 'repair', name: 'Repair Agent', icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { id: 'governance', name: 'Governance Agent', icon: FileText, color: 'text-primary-400', bg: 'bg-primary-500/10' },
];

export default function FairnessCopilot() {
  const { 
    jobId, 
    copilotSummary, 
    isCopilotRunning, 
    setCopilotSummary, 
    setIsCopilotRunning 
  } = useAuditStore();
  
  const [activeStep, setActiveStep] = useState<number>(-1);

  const runCopilot = async () => {
    if (!jobId) return;
    setIsCopilotRunning(true);
    setCopilotSummary(null);
    setActiveStep(0);
    
    // Simulate sequential analysis appearance
    const stepInterval = setInterval(() => {
      setActiveStep(prev => {
        if (prev < 3) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 2000);

    try {
      const res = await fetch(`http://localhost:8000/audits/${jobId}/copilot`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (!res.ok) {
        console.error("Copilot backend error:", data);
        alert(`Copilot Error: ${data.detail || data.error || 'Failed to analyze'}`);
        return;
      }
      
      setCopilotSummary(data);
    } catch (err) {
      console.error("Copilot failed:", err);
      alert("Network error: failed to reach copilot backend.");
    } finally {
      setIsCopilotRunning(false);
      setActiveStep(3);
    }
  };

  if (!copilotSummary && !isCopilotRunning) {
    return (
      <div className="glass-panel p-8 text-center bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-indigo-500/20 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-6 shadow-lg shadow-indigo-500/10">
          <Sparkles size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Fairness Copilot</h2>
        <p className="text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed">
          Initialize a multi-agent orchestration pipeline. Specialized AI agents will audit findings, explain risks, suggest repairs, and provide governance summaries.
        </p>
        <button 
          onClick={runCopilot}
          className="group relative px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-3 mx-auto overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12" />
          <Zap size={20} className="text-yellow-300" />
          Run AI Copilot Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-12">
      {/* Progress Header */}
      <div className="glass-panel p-6 border-indigo-500/30 bg-indigo-950/20">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
               <Sparkles size={20} />
             </div>
             <div>
               <h3 className="text-lg font-bold text-white">Multi-Agent Pipeline</h3>
               <p className="text-xs text-slate-400">Coordinating specialized intelligence layers</p>
             </div>
          </div>
          {isCopilotRunning && (
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold animate-pulse">
              <Loader className="animate-spin" size={14} />
              Agents are collaborating...
            </div>
          )}
        </div>

        <div className="flex items-center justify-between max-w-3xl mx-auto relative px-4">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-800 -translate-y-1/2 -z-10" />
          {AGENTS.map((agent, i) => {
            const Icon = agent.icon;
            const isCompleted = i < activeStep || (copilotSummary && !isCopilotRunning);
            const isActive = i === activeStep && isCopilotRunning;

            return (
              <div key={agent.id} className="flex flex-col items-center gap-2 bg-dark-900/80 p-2 rounded-xl">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                  isCompleted ? `${agent.bg} border-emerald-500 text-emerald-400` :
                  isActive ? 'border-indigo-500 text-indigo-400 animate-pulse scale-110 shadow-lg shadow-indigo-500/20' :
                  'border-slate-800 text-slate-600 bg-dark-800'
                }`}>
                  {isCompleted ? <CheckCircle2 size={24} /> : <Icon size={24} />}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-tighter ${
                  isActive ? 'text-indigo-400' : isCompleted ? 'text-emerald-500' : 'text-slate-600'
                }`}>
                  {agent.name.split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {copilotSummary && (
          <>
            {/* Auditor Findings */}
            <AgentResultCard 
              title="Auditor Findings" 
              agent={AGENTS[0]} 
              content={copilotSummary.agents.auditor}
              delay={0}
            />
            {/* Explainer Narrative */}
            <AgentResultCard 
              title="Impact Narrative" 
              agent={AGENTS[1]} 
              content={copilotSummary.agents.explainer}
              delay={100}
            />
            {/* Repair Strategy */}
            <AgentResultCard 
              title="Repair Strategy" 
              agent={AGENTS[2]} 
              content={copilotSummary.agents.repair}
              delay={200}
            />
            {/* Governance Summary */}
            <AgentResultCard 
              title="Governance Protocol" 
              agent={AGENTS[3]} 
              content={copilotSummary.agents.governance}
              delay={300}
            />
          </>
        )}
      </div>
    </div>
  );
}

function AgentResultCard({ title, agent, content, delay }: { title: string, agent: any, content: string, delay: number }) {
  const Icon = agent.icon;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const renderContent = (str: string) => {
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const arr = JSON.parse(str);
        if (Array.isArray(arr)) {
          return (
            <ul className="list-disc pl-4 space-y-1">
              {arr.map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>
          );
        }
      } catch (e) {
        // Fallback to string if parsing fails
      }
    }
    return str;
  };

  return (
    <div className={`glass-panel overflow-hidden transition-all duration-700 transform ${
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
    }`}>
      <div className={`p-4 border-b border-slate-800 ${agent.bg} flex items-center gap-3`}>
        <div className={`w-8 h-8 rounded bg-dark-900 flex items-center justify-center ${agent.color} border border-white/5 shadow-inner`}>
          <Icon size={18} />
        </div>
        <h4 className="font-bold text-white tracking-tight">{title}</h4>
        <div className="ml-auto flex items-center gap-1">
          {[1,2,3].map(i => <div key={i} className={`w-1 h-1 rounded-full ${agent.color} opacity-${i * 20}`} />)}
        </div>
      </div>
      <div className="p-6">
        <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-medium">
          {renderContent(content)}
        </div>
        <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1">
            <Info size={12} />
            Contextual Insight
          </span>
          <button className={`text-xs font-bold ${agent.color} flex items-center gap-1 hover:brightness-125 transition-all`}>
            Detailed Logs <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
