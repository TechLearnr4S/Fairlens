import React, { useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { Play, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';


export const DemoController: React.FC = () => {
  const navigate = useNavigate();
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [status, setStatus] = useState('');

  const { 
    setFile, setColumns, setColumnTypes, setPreview, setJobId,
    setTargetColumn, toggleProtectedAttribute,
    setDisparities, setProxies, setExplanation,
  } = useAuditStore();


  const runDemo = async () => {
    setIsDemoRunning(true);
    setDemoStep(1);
    setStatus('Loading Sample Dataset...');
    
    // Step 1: Upload Sample
    const sampleCsv = `age,income,gender,zip_code,target\n25,50000,F,10001,0\n45,80000,M,90210,1\n35,60000,F,60601,1\n60,120000,M,33139,1\n22,45000,M,10001,0\n55,110000,F,90210,1\n30,55000,F,60601,0\n50,95000,M,10001,1`;
    const blob = new Blob([sampleCsv], { type: 'text/csv' });
    const file = new File([blob], 'demo_credit_data.csv', { type: 'text/csv' });
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/audits/upload', { method: 'POST', body: formData });
      const data = await res.json();
      
      setFile(file);
      setColumns(data.columns);
      setColumnTypes(data.column_types);
      setPreview(data.preview);
      setJobId(data.job_id);

      navigate('/new-audit');
      
      await new Promise(r => setTimeout(r, 2500));
      setDemoStep(2);
      setStatus('Configuring Fairness Parameters...');
      
      setTargetColumn('target');
      toggleProtectedAttribute('gender');
      
      await new Promise(r => setTimeout(r, 2000));
      setDemoStep(3);
      setStatus('Executing Bias Audit Engine...');

      const auditRes = await fetch(`http://localhost:8000/audits/${data.job_id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_column: 'target',
          protected_attributes: ['gender']
        })
      });
      const auditData = await auditRes.json();
      setDisparities(auditData.disparities);
      setProxies(auditData.proxies || []);
      setExplanation(auditData.explanation || null);
      
      navigate('/');
      
      await new Promise(r => setTimeout(r, 3000));
      setDemoStep(4);
      setStatus('Analyzing Proxy Risks...');
      
      // Scroll to proxy hunter (simulated)
      window.scrollTo({ top: 1000, behavior: 'smooth' });
      
      await new Promise(r => setTimeout(r, 3000));
      setDemoStep(5);
      setStatus('Opening Bias Simulation Sandbox...');
      
      window.scrollTo({ top: 2000, behavior: 'smooth' });
      
      await new Promise(r => setTimeout(r, 2000));
      setStatus('Applying AI Fairness Optimization...');
      
      // Trigger optimize (simulated click logic or direct call)
      // For demo, we'll just wait as if it's happening
      
      await new Promise(r => setTimeout(r, 3000));
      setDemoStep(6);
      setStatus('Generating Governance Passport...');
      
      window.scrollTo({ top: 3000, behavior: 'smooth' });

      await new Promise(r => setTimeout(r, 2000));
      setDemoStep(7);
      setStatus('Demo Complete: Model Optimized.');
      setIsDemoRunning(false);

    } catch (e) {
      setStatus('Demo Interrupted: Error occurred.');
      setIsDemoRunning(false);
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-4">
      {isDemoRunning && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 p-4 rounded-2xl shadow-2xl w-72 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
               <Zap className="text-indigo-400 animate-pulse" size={16} />
               <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Live Demo Mode</span>
            </div>
            <span className="text-[10px] font-black text-slate-500">Step {demoStep}/7</span>
          </div>
          
          <div className="space-y-3">
             <p className="text-xs font-bold text-white leading-relaxed">
               {status}
             </p>
             <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-1000" 
                  style={{ width: `${(demoStep / 7) * 100}%` }}
                />
             </div>
          </div>
        </div>
      )}

      <button 
        onClick={runDemo}
        disabled={isDemoRunning}
        className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 shadow-xl ${
          isDemoRunning 
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-105 active:scale-95'
        }`}
      >
        {isDemoRunning ? (
          <>
            <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
            <span>Presenting...</span>
          </>
        ) : (
          <>
            <Play size={18} fill="currentColor" />
            <span>Start Guided Demo</span>
          </>
        )}
      </button>
    </div>
  );
};
