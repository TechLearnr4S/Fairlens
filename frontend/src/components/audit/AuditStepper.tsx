import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuditStore } from '../../store/auditStore';
import { Check, ArrowRight } from 'lucide-react';

export const AuditStepper: React.FC = () => {
  const { jobId, disparities, simulation, proxies } = useAuditStore();
  const navigate = useNavigate();

  const steps = [
    { id: 'upload', label: 'Upload', desc: 'Dataset Intake' },
    { id: 'analyze', label: 'Analyze', desc: 'Config & Run' },
    { id: 'detect', label: 'Detect', desc: 'Bias Discovery' },
    { id: 'simulate', label: 'Simulate', desc: 'Mitigation Sandbox' },
    { id: 'decide', label: 'Decide', desc: 'Final Strategy' },
  ];

  let currentStep = 0;
  if (jobId) currentStep = 1;
  if (disparities) currentStep = 2;
  if (simulation) currentStep = 3;
  if (simulation && simulation.status !== 'failed') currentStep = 4;

  // Adaptive Guidance Logic
  let nextBestAction = {
    title: "Next Best Action",
    message: "Select target and protected attributes",
    action: "Configure Audit",
    target: "config-section"
  };

  if (!jobId) {
    nextBestAction = { title: "Next Best Action", message: "Upload your dataset to begin", action: "Upload CSV", target: "upload-section" };
  } else if (!disparities) {
    nextBestAction = { title: "Next Best Action", message: "Run fairness audit to identify hidden bias", action: "Run Analysis", target: "analyze-button" };
  } else {
    // Audit results available
    const maxDisp = disparities ? Math.max(...Object.values(disparities).map((d: any) => d.disparity_score)) : 0;
    const highRiskProxies = (proxies || []).filter((p: any) => (p.risk_score > 0.7 || p.severity === 'High' || p.risk_level === 'High')).length > 0;

    if (maxDisp > 0.2) {
      nextBestAction = { title: "Mitigation Required", message: "Significant bias detected. Run simulation to evaluate trade-offs.", action: "Open Sandbox", target: "simulation-sandbox" };
    } else if (highRiskProxies) {
      nextBestAction = { title: "Proxy Risk Detected", message: "Features correlate highly with protected traits. Remove proxies to improve fairness.", action: "Hunter Engine", target: "proxy-hunter" };
    } else if (simulation) {
      nextBestAction = { title: "Strategy Ready", message: "AI has identified an optimal fairness-accuracy balance.", action: "Review & Passport", target: "passport-section" };
    } else {
      nextBestAction = { title: "Discovery Complete", message: "Review audit findings or launch simulation sandbox.", action: "View Insights", target: "insights-section" };
    }
  }

  const scrollToSection = (id: string) => {
    if (id === 'upload-section' || id === 'analyze-button') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleAction = () => {
    if (nextBestAction.action === "Open Sandbox") {
      navigate("/sandbox");
    } else {
      scrollToSection(nextBestAction.target);
    }
  };

  useEffect(() => {
    // Remove existing highlights
    const previous = document.querySelectorAll('.adaptive-highlight');
    previous.forEach(el => el.classList.remove('adaptive-highlight'));
    
    // Add new highlight
    if (nextBestAction.target) {
      const current = document.getElementById(nextBestAction.target);
      if (current) current.classList.add('adaptive-highlight');
    }
    
    return () => {
      const previous = document.querySelectorAll('.adaptive-highlight');
      previous.forEach(el => el.classList.remove('adaptive-highlight'));
    };
  }, [nextBestAction.target, jobId, disparities, simulation]);

  return (
    <div className="w-full mb-10 space-y-4">
      <div className="flex items-center justify-between px-2">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2 group relative">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                index < currentStep 
                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                  : index === currentStep 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] animate-pulse' 
                    : 'bg-dark-800 border-slate-700 text-slate-500'
              }`}>
                {index < currentStep ? <Check size={18} /> : <span className="text-xs font-black">{index + 1}</span>}
              </div>
              <div className="text-center">
                <p className={`text-[10px] font-black uppercase tracking-widest ${index === currentStep ? 'text-indigo-400' : 'text-slate-500'}`}>
                  {step.label}
                </p>
              </div>
              
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-2 py-1 rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {step.desc}
              </div>
            </div>
            
            {index < steps.length - 1 && (
              <div className="flex-1 h-px bg-slate-800 mx-4 relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-1000 ${
                  index < currentStep ? 'w-full' : 'w-0'
                }`} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      
      <div className="flex items-center justify-between gap-4 px-6 py-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-700">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping shrink-0" />
          <div className="space-y-0.5">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">{nextBestAction.title}</p>
            <p className="text-xs font-bold text-slate-200">
              {nextBestAction.message}
            </p>
          </div>
        </div>
        <button 
          onClick={handleAction}
          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 group whitespace-nowrap"
        >
          {nextBestAction.action}
          <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
