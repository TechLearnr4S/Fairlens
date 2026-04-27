import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ShieldCheck, UploadCloud, Users, FileLock, AlertTriangle } from 'lucide-react';
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

                  {/* Accuracy */}
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
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Components */}
        <FairnessCopilot />
        <ProxyBiasHunter />
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

  return (
    <div className="space-y-6">
      <header className="flex justify-between">
        <div>
          <h1 className="text-3xl font-bold text-indigo-400">
            FairLens Studio
          </h1>
          <p className="text-slate-400">
            Bias Audit and Responsible AI Governance
          </p>
        </div>

        <Link to="/new-audit" className="px-4 py-2 bg-indigo-500 text-white rounded-lg flex gap-2">
          <UploadCloud size={18} /> New Audit
        </Link>
      </header>

      <div className="text-center py-16 text-slate-500">
        <Users size={48} className="mx-auto mb-4" />
        No audits yet
      </div>
    </div>
  );
}