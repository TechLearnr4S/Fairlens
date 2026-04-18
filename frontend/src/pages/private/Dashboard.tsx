import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ShieldCheck, UploadCloud, Users, FileLock, AlertTriangle, Download, Loader } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import AuditComments from '../../features/comments/AuditComments';
import FairnessCopilot from '../../components/audit/FairnessCopilot';
import ProxyBiasHunter from '../../components/audit/ProxyBiasHunter';

export default function Dashboard() {
  const { disparities, targetColumn, currentFile, protectedAttributes, proxies, explanation, jobId } = useAuditStore();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
     setIsExporting(true);
     try {
       const res = await fetch('http://localhost:8000/audits/passport', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           job_id: jobId,
           filename: currentFile?.name,
           target_column: targetColumn,
           protected_attributes: protectedAttributes,
           disparities: disparities,
           proxies: proxies,
           explanation: explanation
         })
       });
       
       const data = await res.json();
       if (data.markdown && data.receipt) {
         // Trigger Markdown Download
         const mdBlob = new Blob([data.markdown], { type: 'text/markdown' });
         const mdUrl = URL.createObjectURL(mdBlob);
         const mdLink = document.createElement('a');
         mdLink.href = mdUrl;
         mdLink.download = `Fairness_Passport_${jobId}.md`;
         mdLink.click();
         
         // Trigger JSON Receipt Download
         setTimeout(() => {
            const jsonBlob = new Blob([JSON.stringify(data.receipt, null, 2)], { type: 'application/json' });
            const jsonUrl = URL.createObjectURL(jsonBlob);
            const jsonLink = document.createElement('a');
            jsonLink.href = jsonUrl;
            jsonLink.download = `Audit_Receipt_${jobId}.json`;
            jsonLink.click();
         }, 500);
       }
     } catch (e) {
       console.error(e);
       alert("Failed to export governance documents.");
     } finally {
       setIsExporting(false);
     }
  };

  if (disparities) {
    // Transform data for charts
    const radarData = Object.keys(disparities).map(attr => ({
      attribute: attr,
      disparity: disparities[attr].disparity_score,
      fullMark: 1
    }));
      
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Subgroup Disparity Radar</h1>
            <p className="text-slate-400 mt-1">Audit Results for <span className="text-primary-400 font-medium">{currentFile?.name}</span> predicting <span className="text-indigo-400 font-medium">{targetColumn}</span></p>
          </div>
          <Link to="/new-audit" className="btn-secondary flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg font-medium transition-all duration-200 border border-slate-600">
             Start New Audit
          </Link>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-panel p-6 lg:col-span-1 flex flex-col items-center justify-center">
            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <ShieldCheck className="text-primary-500" />
              Overall Risk Profile
            </h3>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="attribute" tick={{ fill: '#94a3b8' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 0.5]} tickFormatter={(val: any) => parseFloat(val).toFixed(2)} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace' }} />
                  <Radar name="Disparity Score" dataKey="disparity" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-slate-400 text-center mt-4">Values closer to 0 indicate higher fairness. Values above 0.2 indicate severe disparity.</p>
          </div>

          <div className="glass-panel p-6 lg:col-span-2">
            <h3 className="text-xl font-semibold mb-6">Subgroup Metrics Comparison</h3>
            <div className="space-y-12">
              {Object.keys(disparities).map(attr => (
                <div key={attr} className="space-y-6 p-6 bg-slate-800/20 rounded-2xl border border-slate-700/50">
                   <div className="flex items-center justify-between">
                     <div>
                       <h4 className="font-bold text-xl capitalize flex items-center gap-2">
                         {attr}
                         {disparities[attr].warning && <AlertTriangle className="text-rose-500" size={20} />}
                       </h4>
                       <p className="text-sm text-slate-400 mt-1">
                         Group disparity score: <span className="text-primary-400 font-mono font-bold">{(disparities[attr].disparity_score * 100).toFixed(1)}%</span>
                       </p>
                     </div>
                     <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${disparities[attr].risk_level === 'High' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                       {disparities[attr].risk_level} Risk
                     </span>
                   </div>

                   {disparities[attr].warning && (
                     <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-3 text-rose-300 text-sm">
                        <AlertTriangle size={16} />
                        <span><strong>Bias Detected:</strong> {disparities[attr].warning}</span>
                     </div>
                   )}

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                     {/* Selection Rate Chart */}
                     <div className="space-y-2">
                        <h5 className="text-xs font-bold text-slate-500 uppercase">Selection Rate</h5>
                        <div className="w-full h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={disparities[attr].subgroups} layout="vertical" margin={{ left: 20 }}>
                              <XAxis type="number" domain={[0, 1]} hide />
                              <YAxis dataKey="subgroup" type="category" tick={{ fill: '#94a3b8', fontSize: 12 }} width={80} />
                              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                              <Bar dataKey="selection_rate" name="Selection Rate" radius={[0, 4, 4, 0]}>
                                {disparities[attr].subgroups.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={entry.selection_rate < 0.2 ? '#f43f5e' : '#0ea5e9'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                     </div>

                     {/* Accuracy Chart */}
                     <div className="space-y-2">
                        <h5 className="text-xs font-bold text-slate-500 uppercase">Model Accuracy</h5>
                        <div className="w-full h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={disparities[attr].subgroups} layout="vertical" margin={{ left: 20 }}>
                              <XAxis type="number" domain={[0, 1]} hide />
                              <YAxis dataKey="subgroup" type="category" tick={{ fill: '#94a3b8', fontSize: 12 }} width={80} />
                              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                              <Bar dataKey="accuracy" name="Accuracy" radius={[0, 4, 4, 0]}>
                                {disparities[attr].subgroups.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={entry.accuracy < 0.7 ? '#f59e0b' : '#10b981'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                     </div>

                     {/* FPR / FNR Small Multiples */}
                     <div className="col-span-full grid grid-cols-2 gap-4 mt-2">
                        <div className="p-4 bg-dark-900/50 rounded-xl border border-slate-700/30">
                           <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">False Positive Rate Disparity</p>
                           <p className="text-xl font-bold text-white">{(disparities[attr].fpr_disparity * 100).toFixed(1)}%</p>
                           <div className="mt-2 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${disparities[attr].fpr_disparity * 100}%` }} />
                           </div>
                        </div>
                        <div className="p-4 bg-dark-900/50 rounded-xl border border-slate-700/30">
                           <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">False Negative Rate Disparity</p>
                           <p className="text-xl font-bold text-white">{(disparities[attr].fnr_disparity * 100).toFixed(1)}%</p>
                           <div className="mt-2 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500" style={{ width: `${disparities[attr].fnr_disparity * 100}%` }} />
                           </div>
                        </div>
                     </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Fairness Copilot - Multi-Agent Dashboard */}
        <div className="mt-6">
          <FairnessCopilot />
        </div>

        {/* AI Explainer */}
        <div className="glass-panel p-6 mt-6 bg-gradient-to-br from-dark-800 to-indigo-950/20 border-indigo-500/30">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="text-indigo-400" />
            AI Auditor Explanation
          </h3>
          <div className="text-slate-300 space-y-4 leading-relaxed whitespace-pre-wrap">
            {explanation || "No explanation available. Run the initial audit to see insights."}
          </div>
        </div>

        {/* New Detailed Proxy Bias Hunter */}
        <div className="mt-6">
          <ProxyBiasHunter />
        </div>

        {/* Collaborative Comments */}
        <div className="mt-6">
          <AuditComments jobId={jobId!} />
        </div>

        {/* Governance Exports */}
        <div className="flex justify-end mt-8 border-t border-slate-700/50 pt-8">
           <button 
             onClick={handleExport}
             disabled={isExporting}
             className="px-4 py-2 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-400 hover:to-indigo-400 text-white rounded-lg font-medium shadow-lg flex items-center gap-2"
           >
             {isExporting ? <Loader className="animate-spin" size={18} /> : <Download size={18} />}
             Download Passport & Receipt
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400">
            FairLens Studio
          </h1>
          <p className="text-slate-400 mt-1">Bias Audit and Responsible AI Governance</p>
        </div>
        <Link to="/new-audit" className="px-4 py-2 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-400 hover:to-indigo-400 text-white rounded-lg font-medium shadow-lg flex items-center gap-2">
          <UploadCloud size={18} />
          New Audit
        </Link>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="glass-panel p-6 hover:border-primary-500/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 mb-4">
            <Activity size={24} />
          </div>
          <h3 className="text-xl font-semibold mb-2">Bias Detection</h3>
          <p className="text-slate-400 text-sm">Upload datasets and evaluate models across subgroups to detect hidden proxies.</p>
        </div>
        
        <div className="glass-panel p-6 hover:border-primary-500/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
            <ShieldCheck size={24} />
          </div>
          <h3 className="text-xl font-semibold mb-2">Simulate Mitigations</h3>
          <p className="text-slate-400 text-sm">Run 'what-if' scenarios to see how fairness interventions impact performance.</p>
        </div>

        <div className="glass-panel p-6 hover:border-primary-500/50 transition-colors">
          <div className="w-12 h-12 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 mb-4">
            <FileLock size={24} />
          </div>
          <h3 className="text-xl font-semibold mb-2">Fairness Passports</h3>
          <p className="text-slate-400 text-sm">Generate tamper-evident audit receipts for governance and compliance records.</p>
        </div>
      </div>
      
      <div className="glass-panel p-6 mt-8">
        <h2 className="text-2xl font-semibold mb-4">Recent Audits</h2>
        <div className="flex flex-col items-center justify-center py-12 text-slate-500 border-2 border-dashed border-slate-700/50 rounded-xl">
          <Users size={48} className="mb-4 opacity-50" />
          <p>No audits run yet. Click 'New Audit' to begin.</p>
        </div>
      </div>
    </div>
  );
}
