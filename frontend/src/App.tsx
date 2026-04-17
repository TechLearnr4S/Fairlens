import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Activity, ShieldCheck, UploadCloud, Users, FileLock, AlertTriangle, Download, Loader } from 'lucide-react';
import NewAudit from './pages/NewAudit';

import { useAuditStore } from './store/auditStore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

function Dashboard() {
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
          <Link to="/new-audit" className="btn-secondary flex items-center gap-2">
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
                  <PolarRadiusAxis angle={30} domain={[0, 0.5]} tick={{ fill: '#64748b' }} />
                  <Radar name="Disparity Score" dataKey="disparity" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-slate-400 text-center mt-4">Values closer to 0 indicate higher fairness. Values above 0.2 indicate severe disparity.</p>
          </div>

          <div className="glass-panel p-6 lg:col-span-2">
            <h3 className="text-xl font-semibold mb-6">Selection Rates by Subgroup</h3>
            <div className="space-y-8">
              {Object.keys(disparities).map(attr => (
                <div key={attr} className="space-y-4">
                   <div className="flex items-center justify-between">
                     <h4 className="font-medium text-lg capitalize">{attr}</h4>
                     <span className={`px-3 py-1 rounded-full text-xs font-bold ${disparities[attr].risk_level === 'High' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                       {disparities[attr].risk_level} Risk
                     </span>
                   </div>
                   <div className="w-full h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={disparities[attr].subgroups} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                        <XAxis type="number" domain={[0, 1]} hide />
                        <YAxis dataKey="subgroup" type="category" tick={{ fill: '#cbd5e1' }} axisLine={false} tickLine={false} width={100} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }} />
                        <Bar dataKey="selection_rate" name="Selection Rate" radius={[0, 4, 4, 0]}>
                          {
                             disparities[attr].subgroups.map((entry: any, index: number) => (
                               <Cell key={`cell-${index}`} fill={entry.selection_rate < 0.2 ? '#f43f5e' : '#6366f1'} />
                             ))
                          }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Explainer and Proxy Hunter */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
           <div className="glass-panel p-6 lg:col-span-2 bg-gradient-to-br from-dark-800 to-indigo-950/20 border-indigo-500/30">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                 <AlertTriangle className="text-indigo-400" />
                 AI Auditor Explanation
              </h3>
              <div className="text-slate-300 space-y-4 leading-relaxed whitespace-pre-wrap">
                 {explanation || "No explanation available. Check API key."}
              </div>
           </div>

           <div className="glass-panel p-6 lg:col-span-1 border-rose-500/20">
             <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-rose-400">
               Proxy Bias Hunter
             </h3>
             <p className="text-sm text-slate-400 mb-6">Variables strongly correlated with protected traits.</p>
             <div className="space-y-4">
               {proxies && proxies.length > 0 ? (
                 proxies.map((px: any, i: number) => (
                   <div key={i} className="p-3 bg-dark-900 border border-slate-700 rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-rose-300">{px.proxy_feature}</span>
                        <span className="text-xs bg-dark-700 px-2 py-0.5 rounded text-rose-200">{px.severity} Correlation</span>
                      </div>
                      <p className="text-xs text-slate-400">Acts as a proxy for <strong>{px.protected_attribute}</strong> (Score: {px.correlation_score})</p>
                   </div>
                 ))
               ) : (
                 <p className="text-slate-500 text-sm">No high-risk proxies found.</p>
               )}
             </div>
           </div>
        </div>

        {/* Governance Exports */}
        <div className="flex justify-end mt-8 border-t border-slate-700/50 pt-8">
           <button 
             onClick={handleExport}
             disabled={isExporting}
             className="btn-primary flex items-center gap-2 px-6 py-3"
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
        <Link to="/new-audit" className="btn-primary flex items-center gap-2">
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

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-dark-900 text-slate-200">
      <aside className="w-64 border-r border-slate-700/50 bg-dark-800/30 p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold font-sans tracking-tight">FairLens</span>
        </div>
        
        <nav className="space-y-2 flex-1">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary-500/10 text-primary-400 font-medium">
            <Activity size={18} />
            Dashboard
          </Link>
          <Link to="/new-audit" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
            <UploadCloud size={18} />
            Data Intake
          </Link>
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
            <Users size={18} />
            Subgroups
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
            <FileLock size={18} />
            Passports
          </a>
        </nav>
      </aside>
      
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new-audit" element={<NewAudit />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
