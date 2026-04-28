import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, UploadCloud, Users, FileLock, AlertTriangle } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';

import AuditComments from '../../features/comments/AuditComments';
import FairnessCopilot from '../../components/audit/FairnessCopilot';
import ProxyBiasHunter from '../../components/audit/ProxyBiasHunter';
import BiasSandbox from '../../components/audit/BiasSandbox';
import FairnessPassport from '../../components/audit/FairnessPassport';
import AuditIntegrity from '../../components/audit/AuditIntegrity';
import { ModelEvaluator } from '../../components/audit/ModelEvaluator';
import ModelUploader from '../../components/audit/ModelUploader';

export default function Dashboard() {
  const {
    disparities,
    targetColumn,
    currentFile,
    explanation,
    jobId,
    simulation
  } = useAuditStore();

  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (jobId && simulation) {
      fetch(`http://localhost:8000/audits/${jobId}/summary`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch summary");
          return res.json();
        })
        .then(data => setSummary(data.story))
        .catch(err => console.error("Summary fetch error:", err));
    }
  }, [jobId, simulation]);

  if (disparities) {
    const radarData = Object.keys(disparities).map(attr => ({
      attribute: attr,
      disparity: disparities[attr].disparity_score,
      fullMark: 1
    }));

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight">
              Audit Insights
            </h1>
            <p className="text-slate-400 mt-2 font-medium">
              Results for{" "}
              <span className="text-primary-400 font-bold underline">
                {currentFile?.name}
              </span>{" "}
              predicting{" "}
              <span className="text-indigo-400 font-bold">
                {targetColumn}
              </span>
            </p>
          </div>

          <Link
            to="/new-audit"
            className="btn-secondary px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg"
          >
            Start New Audit
          </Link>
        </header>

        {summary && (
          <div className="mb-8 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6 flex gap-4">
            <FileLock size={20} className="text-indigo-400" />
            <div>
              <h3 className="text-xs text-indigo-400 uppercase mb-1">
                Audit Journey Summary
              </h3>
              <p className="text-slate-200 italic">"{summary}"</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Radar */}
          <div className="glass-panel p-8">
            <h3 className="text-xs mb-4 flex items-center gap-2 text-slate-500">
              <ShieldCheck size={16} /> Overall Risk Profile
            </h3>

            <div className="h-72">
              <ResponsiveContainer>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="attribute" />
                  <PolarRadiusAxis domain={[0, 0.5]} />
                  <Radar dataKey="disparity" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subgroups */}
          <div className="lg:col-span-2 space-y-8">
            {Object.keys(disparities).map(attr => (
              <div key={attr} className="p-6 border rounded-xl">
                <h4 className="font-bold text-lg flex items-center gap-2">
                  {attr}
                  {disparities[attr].warning && (
                    <AlertTriangle className="text-red-500" />
                  )}
                </h4>

                <p className="text-sm text-slate-400">
                  {(disparities[attr].disparity_score * 100).toFixed(1)}%
                </p>

                <div className="grid md:grid-cols-2 gap-6 mt-4">
                  {/* Selection Rate */}
                  <ResponsiveContainer height={200}>
                    <BarChart data={disparities[attr].subgroups} layout="vertical">
                      <XAxis type="number" domain={[0, 1]} hide />
                      <YAxis dataKey="subgroup" type="category" />
                      <Tooltip />
                      <Bar dataKey="selection_rate">
                        {disparities[attr].subgroups.map((entry: any, i: number) => (
                          <Cell key={i} fill={entry.selection_rate < 0.2 ? '#f43f5e' : '#0ea5e9'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Accuracy — only shown when ground-truth labels are available */}
                  {disparities[attr].subgroups.some((sg: any) => sg.accuracy != null) && (
                  <ResponsiveContainer height={200}>
                    <BarChart data={disparities[attr].subgroups} layout="vertical">
                      <XAxis type="number" domain={[0, 1]} hide />
                      <YAxis dataKey="subgroup" type="category" />
                      <Tooltip />
                      <Bar dataKey="accuracy">
                        {disparities[attr].subgroups.map((entry: any, i: number) => (
                          <Cell key={i} fill={entry.accuracy < 0.7 ? '#f59e0b' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Components */}
        <FairnessCopilot />
        <ProxyBiasHunter />
        <ModelUploader />
        <ModelEvaluator />
        <BiasSandbox />

        {jobId && <AuditComments jobId={jobId} />}

        <FairnessPassport />
        <AuditIntegrity />

        <div className="glass-panel p-6">
          <h3 className="text-xl mb-2 flex items-center gap-2">
            <AlertTriangle /> AI Auditor Explanation
          </h3>
          <p className="text-slate-300 whitespace-pre-wrap">
            {explanation || "Run audit to see explanation"}
          </p>
        </div>
      </div>
    );
  }

  return <DashboardEmptyState />;
}

// ── Recent Audits empty state ─────────────────────────────────────────────────

function DashboardEmptyState() {
  const { setJobId } = useAuditStore();
  const [recentAudits, setRecentAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/audits/recent')
      .then(r => r.ok ? r.json() : { audits: [] })
      .then(d => setRecentAudits(d.audits || []))
      .catch(() => setRecentAudits([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">FairLens Studio</h1>
          <p className="text-slate-400 mt-1 font-medium">AI Governance & Bias Audit Platform</p>
        </div>
        <Link to="/new-audit" className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95">
          <UploadCloud size={18} /> New Audit
        </Link>
      </header>

      {/* Recent Audits */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Checking Firestore for recent audits...</span>
        </div>
      ) : recentAudits.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">
            Recent Audits — Restored from Cloud
          </h2>
          <div className="grid gap-3">
            {recentAudits.map(a => (
              <div
                key={a.job_id}
                className="glass-panel p-5 rounded-2xl flex items-center justify-between gap-4 hover:border-indigo-500/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                    <ShieldCheck size={18} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{a.filename}</p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {a.row_count.toLocaleString()} rows
                      {a.config?.target && <> · Target: <span className="text-indigo-400">{a.config.target}</span></>}
                      {a.config?.protected?.length > 0 && <> · Protected: {a.config.protected.join(', ')}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.has_results && (
                    <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                      Results Available
                    </span>
                  )}
                  <button
                    onClick={() => setJobId(a.job_id)}
                    className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-black rounded-xl transition-all uppercase tracking-widest group-hover:border-indigo-500/60"
                  >
                    Resume
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-slate-800/50 flex items-center justify-center mx-auto border border-slate-700">
            <Users size={32} className="text-slate-600" />
          </div>
          <div>
            <p className="text-slate-400 font-bold">No audits yet</p>
            <p className="text-slate-600 text-sm mt-1">Upload a CSV to start your first fairness audit</p>
          </div>
          <Link to="/new-audit" className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all mt-2">
            <UploadCloud size={16} /> Start First Audit
          </Link>
        </div>
      )}
    </div>
  );
}
