import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, UploadCloud, Users, AlertTriangle } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';
import { apiFetch } from '../../utils/apiFetch';
import { VerdictCard, type VerdictPayload } from '../../components/audit/VerdictCard';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';

import FairnessCopilot from '../../components/audit/FairnessCopilot';
import ProxyBiasHunter from '../../components/audit/ProxyBiasHunter';
import FairnessPassport from '../../components/audit/FairnessPassport';
import { DemoSummaryBanner } from '../../components/audit/DemoSummaryBanner';
import { WhyThisMatters } from '../../components/audit/WhyThisMatters';
import { AuditEmptyState } from '../../components/ui/AuditEmptyState';
import { ImpactMetrics } from '../../components/audit/ImpactMetrics';
import { MetricStatus } from '../../components/ui/MetricStatus';

function parseVerdict(raw: unknown): VerdictPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const severity = o.severity;
  const legal_exposure = o.legal_exposure;
  const recommendation = o.recommendation;
  const confidence = o.confidence;
  if (
    typeof severity !== 'string' ||
    typeof legal_exposure !== 'string' ||
    typeof recommendation !== 'string'
  ) {
    return null;
  }
  const c = typeof confidence === 'number' ? confidence : Number(confidence);
  if (!Number.isFinite(c)) return null;
  return { severity, legal_exposure, recommendation, confidence: c };
}

export default function Dashboard() {
  const {
    disparities,
    targetColumn,
    currentFile,
    explanation,
    jobId,
    simulation,
    verdict: storeVerdict,
    demoSummary,
  } = useAuditStore();

  const [summary, setSummary] = useState<string | null>(null);
  const [isVerdictLoading, setIsVerdictLoading] = useState(true);

  useEffect(() => {
    // Verdict is expected from the run-audit API response in the store.
    if (!jobId || !disparities) return;
    if (storeVerdict) {
      setIsVerdictLoading(false);
      return;
    }
    setIsVerdictLoading(true);
    const timer = window.setTimeout(() => setIsVerdictLoading(false), 1000);
    return () => window.clearTimeout(timer);
  }, [jobId, disparities, storeVerdict]);

  useEffect(() => {
    if (jobId && simulation) {
      apiFetch(`http://localhost:8000/audits/${jobId}/summary`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch summary");
          return res.json();
        })
        .then(data => setSummary(data.story))
        .catch(err => console.error("Summary fetch error:", err));
    }
  }, [jobId, simulation]);

  if (disparities) {
    const disparityEntries = Object.keys(disparities).map((attr) => ({
      attr,
      data: disparities[attr],
      score: Number(disparities[attr]?.disparity_score ?? 0),
    }));

    const radarData = disparityEntries.map(({ attr, score }) => ({
      attribute: attr,
      disparity: score,
      fullMark: 1
    }));

    const worst = [...disparityEntries].sort((a, b) => b.score - a.score)[0];
    const worstSubgroups = Array.isArray(worst?.data?.subgroups) ? worst.data.subgroups : [];
    const totalRows = worstSubgroups.reduce((sum: number, sg: any) => sum + (Number(sg?.count) || 0), 0);
    const leastSelected = [...worstSubgroups].sort(
      (a: any, b: any) => (Number(a?.selection_rate) || 0) - (Number(b?.selection_rate) || 0),
    )[0];
    const subgroupSize = Number(leastSelected?.count) || 0;
    const affectedGroup =
      typeof leastSelected?.subgroup === 'string' && leastSelected.subgroup.trim()
        ? leastSelected.subgroup
        : worst?.attr || 'Unknown';
    const beforeDisparityPercent = Math.max(0, (Number(worst?.score) || 0) * 100);
    const afterDisparityPercent = simulation?.after?.disparity != null
      ? Math.max(0, Number(simulation.after.disparity) * 100)
      : beforeDisparityPercent;
    const disparityGap = Math.max(0, Number(worst?.score) || 0);
    const impactTotalRows = demoSummary?.total_rows ?? totalRows;
    const impactSubgroupSize = demoSummary?.affected_count ?? subgroupSize;
    const impactDisparityGap = demoSummary?.disparity_gap ?? disparityGap;
    const impactAffectedGroup = demoSummary?.group ?? demoSummary?.impacted_group ?? affectedGroup;

    const displayVerdict = parseVerdict(storeVerdict);
    const showVerdictSkeleton = isVerdictLoading && !displayVerdict;
    const showVerdictEmpty = !isVerdictLoading && !displayVerdict;

    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-16 max-w-7xl mx-auto">
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

        {/* 1) VerdictCard */}
        <section className="pt-1">
          {showVerdictSkeleton ? (
            <VerdictCard mode="loading" />
          ) : displayVerdict ? (
            <VerdictCard
              severity={displayVerdict.severity}
              legal_exposure={displayVerdict.legal_exposure}
              confidence={displayVerdict.confidence}
              recommendation={displayVerdict.recommendation}
            />
          ) : showVerdictEmpty ? (
            <VerdictCard mode="empty" />
          ) : null}
        </section>

        {/* 2) DemoSummaryBanner */}
        {demoSummary && (
          <section className="border-t border-slate-800/70 pt-6">
            <DemoSummaryBanner
              disparity_score={demoSummary.disparity}
              impacted_group={demoSummary.group ?? demoSummary.impacted_group}
              law={demoSummary.law}
              affected_count={demoSummary.affected ?? demoSummary.affected_count}
              improved_count={demoSummary.improved_count}
            />
          </section>
        )}

        {/* 3) WhyThisMatters */}
        {demoSummary && (
          <section className="border-t border-slate-800/70 pt-6">
            <WhyThisMatters />
          </section>
        )}

        {/* 4) FairnessPassport (regulatory) */}
        <section className="border-t border-slate-800/70 pt-6">
          <FairnessPassport />
        </section>

        {/* 5) ImpactMetrics */}
        <section className="border-t border-slate-800/70 pt-6">
          <ImpactMetrics
            totalRows={impactTotalRows}
            subgroupSize={impactSubgroupSize}
            disparityGap={impactDisparityGap}
            affectedGroup={impactAffectedGroup}
            beforeDisparityPercent={beforeDisparityPercent}
            afterDisparityPercent={afterDisparityPercent}
          />
        </section>

        {/* 6) Charts (disparities) */}
        <section className="border-t border-slate-800/70 pt-6 space-y-6">
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

          <div className="space-y-6">
            {Object.keys(disparities).map((attr) => (
              <div key={attr} className="glass-panel p-6 border border-slate-700/60 rounded-2xl">
                <h4 className="font-bold text-lg flex items-center gap-2">
                  {attr}
                  {disparities[attr].warning && (
                    <AlertTriangle className="text-red-500" />
                  )}
                </h4>
                <MetricStatus
                  label="Disparity Score"
                  value={Number(disparities[attr].disparity_score) || 0}
                  threshold={0.2}
                  tooltip="General fairness threshold: disparity scores above 0.20 require mitigation review."
                  className="mt-1"
                />

                <div className="grid md:grid-cols-2 gap-6 mt-4">
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
        </section>

        {/* 7) ProxyBiasHunter */}
        <section className="border-t border-slate-800/70 pt-6">
          <ProxyBiasHunter />
        </section>

        {/* 8) AI Copilot explanation */}
        <section className="border-t border-slate-800/70 pt-6 space-y-6">
          <FairnessCopilot />
          <div className="glass-panel p-6">
            <h3 className="text-xl mb-2 flex items-center gap-2">
              <AlertTriangle /> AI Copilot Explanation
            </h3>
            <p className="text-slate-300 whitespace-pre-wrap">
              {summary || explanation || "Run copilot to see an AI-generated narrative."}
            </p>
          </div>
        </section>
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
  const [recentError, setRecentError] = useState(false);
  const [recentRetryNonce, setRecentRetryNonce] = useState(0);

  useEffect(() => {
    setLoading(true);
    setRecentError(false);
    apiFetch('http://localhost:8000/audits/recent')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('recent')))
      .then(d => setRecentAudits(d.audits || []))
      .catch(() => {
        setRecentAudits([]);
        setRecentError(true);
      })
      .finally(() => setLoading(false));
  }, [recentRetryNonce]);

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
      ) : recentError && recentAudits.length === 0 ? (
        <AuditEmptyState
          variant="failed-api"
          title="Could not load recent audits"
          description="The server did not return your saved audits. Confirm the API is running, then try again."
          onRetry={() => setRecentRetryNonce((n) => n + 1)}
          retryLabel="Retry"
          className="glass-panel max-w-xl mx-auto"
        />
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
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
            <Link 
              to="/new-audit" 
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold transition-all hover:scale-105 active:scale-95"
            >
              New Audit
            </Link>
            <button 
              onClick={() => {
                const demoBtn = Array.from(document.querySelectorAll('button')).find(btn => 
                  btn.textContent?.includes('Start Guided Demo') || btn.textContent?.includes('Presenting')
                );
                if (demoBtn) demoBtn.click();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95"
            >
              <UploadCloud size={16} /> Try Live Demo
            </button>
          </div>
          <p className="text-slate-500 text-xs mt-2">Run a sample audit in seconds</p>
        </div>

      )}
    </div>
  );
}
