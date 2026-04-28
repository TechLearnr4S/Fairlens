import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, UploadCloud, AlertTriangle, Zap, Loader } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { unwrapAuditBody } from '../../utils/auditEnvelope';
import { auth } from '../../firebase';
import { buildAuditSummary } from '../../utils/auditSummary';
import { VerdictCard, type VerdictPayload } from '../../components/audit/VerdictCard';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';

import FairnessCopilot from '../../components/audit/FairnessCopilot';
import ProxyBiasHunter from '../../components/audit/ProxyBiasHunter';
import FairnessPassport from '../../components/audit/FairnessPassport';
import { ImpactSummaryBanner } from '../../components/audit/ImpactSummaryBanner';
import { WhyThisMatters } from '../../components/audit/WhyThisMatters';
import { ImpactMetrics } from '../../components/audit/ImpactMetrics';
import { MetricStatus } from '../../components/ui/MetricStatus';

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.clone().json();
    const detail = (data as { detail?: unknown; message?: unknown; error?: unknown }).detail
      ?? (data as { message?: unknown }).message
      ?? (data as { error?: unknown }).error;
    if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg ?? JSON.stringify(d)).join(', ');
    if (typeof detail === 'string') return detail;
    if (detail != null) return JSON.stringify(detail);
  } catch {
    try {
      const text = await response.clone().text();
      if (text) return text;
    } catch {
      // ignore
    }
  }
  return fallback;
}

/** Maps logical names (e.g. gender) to actual CSV column names (e.g. sex). */
function resolveProtectedColumns(requested: string[], columns: string[]): string[] {
  const byLower = new Map(columns.map((c) => [c.toLowerCase(), c] as const));

  const resolveOne = (name: string): string => {
    const lower = name.toLowerCase();
    const direct = byLower.get(lower);
    if (direct) return direct;

    if (lower === 'gender') {
      const sex = byLower.get('sex');
      if (sex) return sex;
      const genderCol = byLower.get('gender');
      if (genderCol) return genderCol;
    }

    throw new Error(`Column "${name}" not found in demo dataset.`);
  };

  return requested.map(resolveOne);
}

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
    auditSummary,
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
    const impactTotalRows = auditSummary?.total_rows ?? totalRows;
    const impactSubgroupSize = auditSummary?.affected_count ?? subgroupSize;
    const impactDisparityGap = auditSummary?.disparity_gap ?? disparityGap;
    const impactAffectedGroup = auditSummary?.group ?? auditSummary?.impacted_group ?? affectedGroup;

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
              {targetColumn ? (
                <span className="text-indigo-400 font-bold">{targetColumn}</span>
              ) : (
                <span className="text-slate-500 font-medium italic">no outcome column set</span>
              )}
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

        {/* 2) ImpactSummaryBanner */}
        {auditSummary && (
          <section className="border-t border-slate-800/70 pt-6">
            <ImpactSummaryBanner
              disparity_score={auditSummary.disparity}
              impacted_group={auditSummary.group ?? auditSummary.impacted_group}
              law={auditSummary.law}
              affected_count={auditSummary.affected ?? auditSummary.affected_count}
              improved_count={auditSummary.improved_count}
            />
          </section>
        )}

        {/* 3) WhyThisMatters */}
        {auditSummary && (
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
              {summary || (typeof explanation === 'object' ? explanation?.summary : explanation) || "Run copilot to see an AI-generated narrative."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  return <DashboardEmptyState />;
}

// ── Manual audit empty state ──────────────────────────────────────────────────

const DEMO_CSV_PATH = '/demo_data/adult_income_sample.csv';
const LIVE_DEMO_USE_CASE = 'Hiring';
const LIVE_DEMO_PROTECTED = ['gender', 'race'] as const;
const LIVE_DEMO_TARGET = 'income';

function DashboardEmptyState() {
  const navigate = useNavigate();
  const [liveDemoLoading, setLiveDemoLoading] = useState(false);
  const [liveDemoError, setLiveDemoError] = useState<string | null>(null);

  const {
    setFile,
    setColumns,
    setColumnTypes,
    setPreview,
    setJobId,
    setTargetColumn,
    setProtectedAttributes,
    setDisparities,
    setVerdict,
    setProxies,
    setExplanation,
    setAuditSummary,
  } = useAuditStore();

  const handleLiveDemo = useCallback(async () => {
    setLiveDemoError(null);
    setLiveDemoLoading(true);
    try {
      const csvRes = await apiFetch(DEMO_CSV_PATH);
      if (!csvRes.ok) {
        throw new Error(await getApiErrorMessage(csvRes, 'Could not load the demo dataset.'));
      }
      const csvText = await csvRes.text();
      const blob = new Blob([csvText], { type: 'text/csv' });
      const file = new File([blob], 'adult_income_sample.csv', { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await apiFetch('http://localhost:8000/audits/upload', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        throw new Error(await getApiErrorMessage(uploadRes, 'Upload failed.'));
      }
      const uploadData = (await uploadRes.json()) as {
        job_id: string;
        columns: string[];
        column_types: Record<string, string>;
        preview: Record<string, unknown>[];
        file_url?: string | null;
      };

      const { job_id, columns, column_types, preview } = uploadData;
      if (!columns?.length || !job_id) {
        throw new Error('Upload response was missing job id or columns.');
      }

      if (!columns.includes(LIVE_DEMO_TARGET)) {
        throw new Error(`Demo dataset must include a "${LIVE_DEMO_TARGET}" column.`);
      }

      const protectedResolved = resolveProtectedColumns([...LIVE_DEMO_PROTECTED], columns);

      const configRes = await apiFetch('http://localhost:8000/audits/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id,
          user_id: auth.currentUser?.uid ?? 'anonymous',
          target: LIVE_DEMO_TARGET,
          protected_attributes: protectedResolved,
          filename: file.name,
          file_url: uploadData.file_url ?? null,
          use_case: LIVE_DEMO_USE_CASE,
        }),
      });
      if (!configRes.ok) {
        throw new Error(await getApiErrorMessage(configRes, 'Could not save audit configuration.'));
      }

      const runRes = await apiFetch(`http://localhost:8000/audits/${job_id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_column: LIVE_DEMO_TARGET,
          protected_attributes: protectedResolved,
        }),
      });
      if (!runRes.ok) {
        throw new Error(await getApiErrorMessage(runRes, 'Fairness audit run failed.'));
      }
      const auditData = unwrapAuditBody(await runRes.json()) as {
        disparities?: unknown;
        proxies?: unknown[];
        verdict?: Record<string, unknown> | null;
      };

      if (!auditData.disparities) {
        throw new Error('Audit completed but returned no disparity results.');
      }

      setFile(file);
      setColumns(columns);
      setColumnTypes(column_types);
      setPreview(preview);
      setJobId(job_id);
      setTargetColumn(LIVE_DEMO_TARGET);
      setProtectedAttributes(protectedResolved);
      setDisparities(auditData.disparities);
      setProxies(Array.isArray(auditData.proxies) ? auditData.proxies : []);
      setVerdict(auditData.verdict ?? null);
      setAuditSummary(buildAuditSummary(auditData.disparities as Record<string, unknown>));

      try {
        const explainRes = await apiFetch(`http://localhost:8000/audits/${job_id}/explain`, {
          method: 'POST',
        });
        if (explainRes.ok) {
          const explanation = await explainRes.json();
          setExplanation(explanation);
        }
      } catch {
        /* optional LLM narrative */
      }

      navigate('/');
    } catch (err) {
      console.error('Live demo failed:', err);
      if (isRequestTimeout(err)) {
        return;
      }
      setLiveDemoError(err instanceof Error ? err.message : 'Live demo failed. Try again or upload a CSV manually.');
    } finally {
      setLiveDemoLoading(false);
    }
  }, [
    navigate,
    setFile,
    setColumns,
    setColumnTypes,
    setPreview,
    setJobId,
    setTargetColumn,
    setProtectedAttributes,
    setDisparities,
    setVerdict,
    setProxies,
    setExplanation,
    setAuditSummary,
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">FairLens Studio</h1>
          <p className="text-slate-400 mt-1 font-medium">AI Governance & Bias Audit Platform</p>
        </div>
        <Link to="/new-audit" className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95">
          <UploadCloud size={18} /> New Audit
        </Link>
      </header>

      <div className="glass-panel rounded-3xl border border-slate-700/50 bg-slate-900/40 py-20 px-8 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 flex items-center justify-center mx-auto border border-indigo-500/20">
          <UploadCloud size={34} className="text-indigo-400" />
        </div>
        <div className="space-y-2">
          <p className="text-xl text-white font-black">No audits yet.</p>
          <p className="text-slate-400 text-sm">
            Upload a dataset to start your first fairness audit.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleLiveDemo}
            disabled={liveDemoLoading}
            aria-busy={liveDemoLoading}
            className="group inline-flex items-center justify-center gap-3 w-full max-w-md mx-auto px-10 py-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-widest text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:from-indigo-500 hover:via-violet-500 hover:to-fuchsia-500 shadow-xl shadow-indigo-500/40 ring-2 ring-white/15 ring-offset-2 ring-offset-slate-900/90 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-amber-400/80 disabled:opacity-60 disabled:pointer-events-none disabled:hover:scale-100"
          >
            {liveDemoLoading ? (
              <Loader size={22} className="shrink-0 animate-spin text-amber-200" aria-hidden />
            ) : (
              <Zap size={22} className="shrink-0 text-amber-200 group-hover:animate-pulse" aria-hidden />
            )}
            {liveDemoLoading ? 'Running demo…' : 'Try Live Demo'}
          </button>

          {liveDemoError && (
            <div
              role="alert"
              className="w-full max-w-md mx-auto rounded-xl border border-red-500/40 bg-red-950/60 px-4 py-3 text-left text-sm text-red-100 shadow-inner"
            >
              {liveDemoError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full pt-2">
            <Link
              to="/new-audit"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95 sm:min-w-[11rem]"
            >
              <UploadCloud size={16} /> Upload CSV
            </Link>
            <Link
              to="/new-audit?demo=adult-income&guided=1"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-950/80 hover:bg-violet-900/90 text-violet-100 border border-violet-600/50 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 sm:min-w-[11rem]"
            >
              <Zap size={16} className="text-violet-300" /> Demo wizard
            </Link>
            <Link
              to="/new-audit"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 sm:min-w-[11rem]"
            >
              New Audit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
