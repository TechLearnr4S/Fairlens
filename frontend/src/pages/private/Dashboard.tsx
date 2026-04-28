import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, UploadCloud, AlertTriangle, Zap, Loader, Play, Wrench, CheckCircle2, Users, Scale, TrendingDown, Download } from 'lucide-react';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { useAuditStore } from '../../store/auditStore';
import { useAuditProgressStore } from '../../store/auditProgressStore';
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

function StorySection({
  index,
  title,
  children,
  className = '',
}: {
  index: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-4 border-t border-white/[0.08] pt-10 ${className}`}>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">
        {index} {title}
      </p>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
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
  const [applyFixLoading, setApplyFixLoading] = useState(false);
  const [applyFixMessage, setApplyFixMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const advanceProgressTo = useAuditProgressStore((state) => state.advanceTo);

  const openSandbox = useCallback(() => {
    advanceProgressTo(4, jobId);
    navigate('/sandbox');
  }, [advanceProgressTo, jobId, navigate]);

  const applyRecommendedFix = useCallback(async () => {
    if (!jobId) return;
    setApplyFixLoading(true);
    setApplyFixMessage(null);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/optimize`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { detail?: string })?.detail || 'Optimization failed.');
      }
      advanceProgressTo(4, jobId);
      const threshold = (data as { optimal_threshold?: unknown })?.optimal_threshold;
      setApplyFixMessage({
        type: 'success',
        text: threshold != null
          ? `Recommended fix prepared: threshold ${threshold}. Open the sandbox to review the before/after impact.`
          : 'Recommended fix prepared. Open the sandbox to review the before/after impact.',
      });
    } catch (err) {
      if (isRequestTimeout(err)) return;
      setApplyFixMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not prepare the recommended fix.',
      });
    } finally {
      setApplyFixLoading(false);
    }
  }, [advanceProgressTo, jobId]);

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
      <div className="animate-in fade-in duration-500 pb-16 max-w-7xl mx-auto">
        <header className="flex flex-col gap-5 mb-12 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#8B5CF6]">
              Detection to decision
            </p>
            <h1 className="mt-2 text-4xl font-black text-white tracking-tight">
              Audit Command Center
            </h1>
            <p className="text-[#9CA3AF] mt-3 font-medium">
              Results for{' '}
              <span className="text-white font-bold">
                {currentFile?.name ?? 'current dataset'}
              </span>{' '}
              predicting{' '}
              {targetColumn ? (
                <span className="text-[#8B5CF6] font-bold">{targetColumn}</span>
              ) : (
                <span className="text-slate-500 font-medium italic">no outcome column set</span>
              )}
            </p>
          </div>

          <Link
            to="/new-audit"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#111827] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.06]"
          >
            Start New Audit
          </Link>
        </header>

        {/* Human Impact Headline */}
        {auditSummary && (
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-5">
            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                <Users size={20} className="text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Real-world impact</p>
                <p className="mt-1 text-base font-bold text-white leading-relaxed">
                  Approximately{' '}
                  <span className="text-amber-300">
                    {auditSummary.affected_count.toLocaleString()} {auditSummary.impacted_group}
                  </span>{' '}
                  are being disadvantaged by a{' '}
                  <span className="text-amber-300">{(auditSummary.disparity_gap * 100).toFixed(1)}% disparity gap</span>
                  {' '}— potentially in violation of{' '}
                  <span className="text-amber-300">{auditSummary.law}</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Regulatory Risk Summary */}
        {disparities && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={`rounded-2xl border p-4 ${
              (storeVerdict as any)?.severity === 'CRITICAL' || (storeVerdict as any)?.severity === 'HIGH'
                ? 'border-red-500/30 bg-red-500/10'
                : (storeVerdict as any)?.severity === 'MEDIUM'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-emerald-500/30 bg-emerald-500/10'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <Scale size={14} className="text-slate-400" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Regulatory Risk</p>
              </div>
              <p className={`text-lg font-black ${
                (storeVerdict as any)?.severity === 'CRITICAL' || (storeVerdict as any)?.severity === 'HIGH'
                  ? 'text-red-300' : (storeVerdict as any)?.severity === 'MEDIUM' ? 'text-amber-300' : 'text-emerald-300'
              }`}>
                {(storeVerdict as any)?.legal_exposure ?? 'Evaluating…'}
              </p>
            </div>
            <div className={`rounded-2xl border p-4 ${
              (storeVerdict as any)?.severity === 'CRITICAL' || (storeVerdict as any)?.severity === 'HIGH'
                ? 'border-red-500/30 bg-red-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-slate-400" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Severity</p>
              </div>
              <p className={`text-lg font-black ${
                (storeVerdict as any)?.severity === 'CRITICAL' ? 'text-red-300'
                : (storeVerdict as any)?.severity === 'HIGH' ? 'text-orange-300'
                : (storeVerdict as any)?.severity === 'MEDIUM' ? 'text-amber-300' : 'text-emerald-300'
              }`}>
                {(storeVerdict as any)?.severity ?? '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={14} className="text-slate-400" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Audit Integrity</p>
              </div>
              <p className="text-lg font-black text-emerald-300">Ed25519 Signed</p>
            </div>
          </div>
        )}

        <div className="space-y-12">
          <StorySection index="01" title="Verdict">
            {showVerdictSkeleton ? (
              <VerdictCard mode="loading" />
            ) : displayVerdict ? (
              <VerdictCard
                severity={displayVerdict.severity}
                legal_exposure={displayVerdict.legal_exposure}
                confidence={displayVerdict.confidence}
                recommendation={displayVerdict.recommendation}
              >
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={openSandbox}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#6366F1] px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-[#6366F1]/20 transition hover:bg-[#8B5CF6]"
                  >
                    <Play size={16} className="fill-white" />
                    Run Simulation
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyRecommendedFix()}
                    disabled={applyFixLoading || !jobId}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0B1220] px-5 py-3 text-sm font-black uppercase tracking-widest text-white transition hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {applyFixLoading ? <Loader size={16} className="animate-spin" /> : <Wrench size={16} />}
                    Apply Fix
                  </button>
                </div>
                {applyFixMessage && (
                  <div
                    role="status"
                    className={`mt-4 flex items-start gap-3 rounded-2xl border p-4 text-sm ${
                      applyFixMessage.type === 'success'
                        ? 'border-[#10B981]/30 bg-[#10B981]/10 text-emerald-100'
                        : 'border-[#EF4444]/30 bg-[#EF4444]/10 text-rose-100'
                    }`}
                  >
                    {applyFixMessage.type === 'success' ? (
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#10B981]" />
                    ) : (
                      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#EF4444]" />
                    )}
                    <span>{applyFixMessage.text}</span>
                  </div>
                )}
              </VerdictCard>
            ) : showVerdictEmpty ? (
              <VerdictCard mode="empty" />
            ) : null}
          </StorySection>

          {auditSummary && (
            <StorySection index="02" title="Insight Banner">
              <ImpactSummaryBanner
                disparity_score={auditSummary.disparity}
                impacted_group={auditSummary.group ?? auditSummary.impacted_group}
                law={auditSummary.law}
                affected_count={auditSummary.affected ?? auditSummary.affected_count}
                improved_count={auditSummary.improved_count}
              />
            </StorySection>
          )}

          {auditSummary && (
            <StorySection index="03" title="Why This Matters">
              <WhyThisMatters
                group={auditSummary.group ?? auditSummary.impacted_group}
                law={auditSummary.law}
                affectedCount={auditSummary.affected ?? auditSummary.affected_count}
              />
            </StorySection>
          )}

          <StorySection index="04" title="Regulatory Passport">
            <FairnessPassport />
          </StorySection>

          <StorySection index="05" title="Impact Panel">
            <ImpactMetrics
              totalRows={impactTotalRows}
              subgroupSize={impactSubgroupSize}
              disparityGap={impactDisparityGap}
              affectedGroup={impactAffectedGroup}
              beforeDisparityPercent={beforeDisparityPercent}
              afterDisparityPercent={afterDisparityPercent}
            />
          </StorySection>

          <StorySection index="06" title="Charts">
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/[0.08] bg-[#111827] p-8">
                <h3 className="text-xs mb-4 flex items-center gap-2 font-black uppercase tracking-[0.18em] text-[#9CA3AF]">
                  <ShieldCheck size={16} /> Overall Risk Profile
                </h3>
                <div className="h-72">
                  <ResponsiveContainer>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="attribute" />
                      <PolarRadiusAxis domain={[0, 0.5]} />
                      <Radar dataKey="disparity" fill="#6366F1" fillOpacity={0.6} stroke="#8B5CF6" />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-6">
                {Object.keys(disparities).map((attr) => (
                  <div key={attr} className="rounded-3xl border border-white/[0.08] bg-[#111827] p-6">
                    <h4 className="font-black text-lg flex items-center gap-2 text-white">
                      {attr}
                      {disparities[attr].warning && (
                        <AlertTriangle className="text-[#EF4444]" />
                      )}
                    </h4>
                    <MetricStatus
                      label="Disparity Score"
                      value={Number(disparities[attr].disparity_score) || 0}
                      threshold={0.2}
                      tooltip="General fairness threshold: disparity scores above 0.20 require mitigation review."
                      className="mt-2"
                    />

                    <div className="grid md:grid-cols-2 gap-6 mt-5">
                      <ResponsiveContainer height={200}>
                        <BarChart data={disparities[attr].subgroups} layout="vertical">
                          <XAxis type="number" domain={[0, 1]} hide />
                          <YAxis dataKey="subgroup" type="category" />
                          <Tooltip />
                          <Bar dataKey="selection_rate">
                            {disparities[attr].subgroups.map((entry: any, i: number) => (
                              <Cell key={i} fill={entry.selection_rate < 0.2 ? '#EF4444' : '#6366F1'} />
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
                                <Cell key={i} fill={entry.accuracy < 0.7 ? '#F59E0B' : '#10B981'} />
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
          </StorySection>

          <StorySection index="07" title="Proxy Bias Hunter">
            <ProxyBiasHunter />
          </StorySection>

          <StorySection index="08" title="AI Insight">
            <div className="rounded-3xl border border-white/[0.08] bg-[#111827] p-6">
              <h3 className="text-xl font-black mb-3 flex items-center gap-2 text-white">
                <AlertTriangle className="text-[#F59E0B]" /> AI Copilot Explanation
              </h3>
              <p className="text-[#D1D5DB] whitespace-pre-wrap leading-relaxed">
                {summary || (typeof explanation === 'object' ? explanation?.summary : explanation) || 'Run copilot to see an AI-generated narrative.'}
              </p>
            </div>
          </StorySection>

          <StorySection index="09" title="Copilot">
            <FairnessCopilot />
          </StorySection>
        </div>
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

type RecentAudit = {
  job_id: string;
  filename: string;
  upload_time?: string;
  analysis_time?: string;
  has_results?: boolean;
  risk_level?: string;
};

function RiskBadge({ level }: { level?: string }) {
  const normalized = level || 'Unknown';
  const cls = normalized === 'High' || normalized === 'Critical'
    ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30'
    : normalized === 'Medium'
      ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
      : 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30';
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${cls}`}>
      {normalized}
    </span>
  );
}

function DashboardEmptyState() {
  const navigate = useNavigate();
  const [liveDemoLoading, setLiveDemoLoading] = useState(false);
  const [liveDemoError, setLiveDemoError] = useState<string | null>(null);
  const [recentAudits, setRecentAudits] = useState<RecentAudit[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

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
      const uploadData = unwrapAuditBody(await uploadRes.json()) as {
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
      // Immediately push to recent audits so the history panel shows an entry
      setRecentAudits((prev) => [
        { job_id, filename: file.name, upload_time: new Date().toISOString(), has_results: true },
        ...prev.filter((a) => a.job_id !== job_id).slice(0, 4),
      ]);

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

  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    apiFetch('http://localhost:8000/audits/recent')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load recent audits')))
      .then((data) => {
        if (!cancelled) setRecentAudits(Array.isArray(data?.audits) ? data.audits : []);
      })
      .catch(() => {
        if (!cancelled) setRecentAudits([]);
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      <div className="rounded-3xl border border-white/[0.08] bg-[#111827] py-20 px-8 text-center space-y-6">
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
            className="group inline-flex items-center justify-center gap-3 w-full max-w-md mx-auto px-10 py-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none disabled:hover:scale-100"
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
              to="/new-audit"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 sm:min-w-[11rem]"
            >
              New Audit
            </Link>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-white/[0.08] bg-[#111827] p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-black text-white">Recent Audits</h2>
            <p className="text-sm text-[#9CA3AF]">Resume prior work or jump into the full audit history.</p>
          </div>
          <Link to="/history" className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
            View History
          </Link>
        </div>
        {recentLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-800/80 animate-pulse" />)}
          </div>
        ) : recentAudits.length === 0 ? (
          <p className="rounded-2xl border border-slate-800 bg-[#0B1220] p-5 text-sm text-[#9CA3AF]">
            No saved audits found yet. Run the live demo or upload a CSV to create your first record.
          </p>
        ) : (
          <div className="space-y-3">
            {recentAudits.slice(0, 5).map((audit) => (
              <div key={audit.job_id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#0B1220] p-4 transition hover:border-indigo-500/40 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-white">{audit.filename || 'Untitled audit'}</p>
                  <p className="text-xs text-[#9CA3AF]">
                    {audit.analysis_time || audit.upload_time ? new Date(audit.analysis_time || audit.upload_time || '').toLocaleString() : 'No timestamp'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <RiskBadge level={audit.risk_level ?? (audit.has_results ? 'Medium' : 'Unknown')} />
                  <button
                    onClick={async () => {
                      // If this audit is the current active session, show results
                      // Otherwise download the passport (the only persisted artifact)
                      const res = await apiFetch(`http://localhost:8000/audits/${audit.job_id}/passport`).catch(() => null);
                      if (res?.ok) {
                        const json = await res.json().catch(() => null);
                        if (json) {
                          const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url; a.download = `FairLens_Passport_${audit.job_id.slice(0,8)}.json`;
                          a.click(); URL.revokeObjectURL(url);
                        }
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-500"
                  >
                    <Download size={12} /> Passport
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
