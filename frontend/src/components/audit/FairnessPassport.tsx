import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX,
  FileText, AlertTriangle, Cpu, Layers, Clock,
  Download, Printer, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertCircle, Info, TrendingDown,
} from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { AuditEmptyState } from '../ui/AuditEmptyState';
import { MetricStatus } from '../ui/MetricStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KeyMetrics {
  overall_accuracy?: number;
  max_disparity_score?: number;
  disparate_impact_ratio?: number;
  affected_group_count?: number;
}

interface FairnessSummary {
  key_metrics: KeyMetrics;
  affected_groups: string[];
  disparity_by_attribute?: Record<string, number>;
}

interface RegulatoryFramework {
  name?: string;
  body?: string;
  reference?: string;
}

interface RegulatoryViolation {
  attribute?: string;
  metric?: string;
  value?: number;
  threshold?: number;
  detail?: string;
}

interface RegulatoryCompliance {
  framework?: RegulatoryFramework;
  status?: string;
  violations?: RegulatoryViolation[];
  remediation_steps?: string[];
}

interface ProxyRisk {
  feature: string;
  proxy_for: string;
  correlation_score: number;
  risk_level: string;
}

interface Mitigation {
  methods_applied: string[];
  bias_reduction_pct: number;
  accuracy_tradeoff_pct: number;
  impact_summary: string;
}

interface RiskAssessment {
  risk_level: 'High' | 'Medium' | 'Low' | 'Unknown';
  risk_score: number;
  components?: {
    disparity_component?: number;
    proxy_component?: number;
    spread_component?: number;
  };
}

interface Decision {
  status: 'Approve' | 'Conditional' | 'Reject' | 'Unknown';
  confidence: number;
  reason: string;
  summary: string;
}

interface AuditTrace {
  steps: string[];
  timestamped_events: { action: string; timestamp: string; details: Record<string, unknown> }[];
}

interface Passport {
  job_id: string;
  schema_version: string;
  model_info: { dataset: string; use_case: string; target: string; created_at: string };
  fairness_summary: FairnessSummary;
  proxy_risks: ProxyRisk[];
  mitigation: Mitigation;
  regulatory_compliance?: RegulatoryCompliance;
  risk_assessment: RiskAssessment;
  decision: Decision;
  audit_trace: AuditTrace;
  ai_insights: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pct = (v?: number) => `${((v ?? 0) * 100).toFixed(1)}%`;
const score = (v?: number) => (v ?? 0).toFixed(4);

// ─── Sub-components ──────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  const cfg: Record<string, { bg: string; icon: React.ReactNode }> = {
    High:    { bg: 'bg-rose-500/15 border-rose-500/40 text-rose-400',     icon: <ShieldX size={13} /> },
    Medium:  { bg: 'bg-amber-500/15 border-amber-500/40 text-amber-400',  icon: <ShieldAlert size={13} /> },
    Low:     { bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400', icon: <ShieldCheck size={13} /> },
    Unknown: { bg: 'bg-slate-500/15 border-slate-500/40 text-slate-400',  icon: <Info size={13} /> },
  };
  const c = cfg[level] ?? cfg.Unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-black uppercase tracking-widest ${c.bg}`}>
      {c.icon} {level} Risk
    </span>
  );
}

function DecisionBanner({ decision }: { decision: Decision }) {
  const cfg: Record<string, { bg: string; border: string; textColor: string; icon: React.ReactNode; label: string }> = {
    Approve:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', textColor: 'text-emerald-400', icon: <CheckCircle size={32} />, label: 'APPROVED' },
    Conditional: { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   textColor: 'text-amber-400',   icon: <AlertCircle size={32} />, label: 'CONDITIONAL' },
    Reject:      { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    textColor: 'text-rose-400',    icon: <XCircle size={32} />,    label: 'NOT APPROVED' },
    Unknown:     { bg: 'bg-slate-800/50',   border: 'border-slate-700',      textColor: 'text-slate-400',   icon: <Info size={32} />,       label: 'UNKNOWN' },
  };
  const c = cfg[decision.status] ?? cfg.Unknown;
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6`}>
      <div className={`${c.textColor} shrink-0`}>{c.icon}</div>
      <div className="flex-1">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-0.5">Deployment Status</p>
        <p className={`text-3xl font-black tracking-tight ${c.textColor}`}>{c.label}</p>
        <p className="text-slate-300 text-sm mt-2 leading-relaxed">{decision.reason}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Confidence</p>
        <p className={`text-2xl font-mono font-black ${c.textColor}`}>
          {((decision.confidence ?? 0) * 100).toFixed(0)}%
        </p>
      </div>
    </div>
  );
}

function Section({ icon, title, children, defaultOpen = true }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/60 hover:bg-slate-800/60 transition-colors"
      >
        <span className="flex items-center gap-3 text-sm font-black text-white uppercase tracking-widest">
          <span className="text-indigo-400">{icon}</span>
          {title}
        </span>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>
      {open && <div className="p-6 bg-slate-950/30 space-y-4">{children}</div>}
    </div>
  );
}

function MetricPill({ label, value, accent = 'text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-black font-mono ${accent}`}>{value}</p>
    </div>
  );
}

function ProxyRow({ p }: { p: ProxyRisk }) {
  const riskColor: Record<string, string> = {
    High: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    Critical: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    Medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    Low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/60 last:border-0">
      <div className="flex items-center gap-3">
        <AlertTriangle size={14} className="text-slate-500 shrink-0" />
        <div>
          <span className="font-bold text-white text-sm">{p.feature}</span>
          <span className="text-slate-500 text-xs mx-2">→ proxy for</span>
          <span className="text-indigo-400 text-sm font-semibold">{p.proxy_for}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-slate-400">{score(p.correlation_score)}</span>
        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${riskColor[p.risk_level] ?? riskColor.Medium}`}>
          {p.risk_level}
        </span>
      </div>
    </div>
  );
}

function TraceItem({ event }: { event: AuditTrace['timestamped_events'][0] }) {
  const labelMap: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    DATASET_UPLOADED:      { label: 'Dataset Uploaded',        icon: <Download size={14} />,   color: 'text-sky-400' },
    FAIRNESS_RUN:          { label: 'Fairness Analysis Run',   icon: <Cpu size={14} />,        color: 'text-indigo-400' },
    PROXY_DETECTION:       { label: 'Proxy Detection',         icon: <AlertTriangle size={14} />, color: 'text-amber-400' },
    SIMULATION_APPLIED:    { label: 'Simulation Applied',      icon: <TrendingDown size={14} />, color: 'text-emerald-400' },
    EXPLANATION_GENERATED: { label: 'AI Explanation Generated',icon: <Info size={14} />,       color: 'text-violet-400' },
    PASSPORT_GENERATED:    { label: 'Passport Generated',      icon: <ShieldCheck size={14} />, color: 'text-teal-400' },
  };
  const cfg = labelMap[event.action] ?? { label: event.action, icon: <Clock size={14} />, color: 'text-slate-400' };
  const ts = new Date(event.timestamp);
  const timeStr = isNaN(ts.getTime()) ? event.timestamp : ts.toLocaleTimeString();
  return (
    <div className="flex items-start gap-3">
      <div className={`shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{cfg.label}</p>
        <p className="text-[11px] text-slate-500 font-mono">{timeStr}</p>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FairnessPassport() {
  const { jobId } = useAuditStore();
  const [passport, setPassport] = useState<Passport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchNonce, setFetchNonce] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobId) return;
    const fetchPassport = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`http://localhost:8000/audits/${jobId}/passport`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        let data: Passport;
        try { data = await res.json(); } catch { throw new Error('Invalid JSON from server'); }
        setPassport(data);
      } catch (e: unknown) {
        if (!isRequestTimeout(e)) {
          setError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPassport();
  }, [jobId, fetchNonce]);

  const downloadJSON = () => {
    if (!passport) return;
    const blob = new Blob([JSON.stringify(passport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fairness_Passport_${passport.job_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    // Use native browser print — CSS @media print will isolate the passport
    document.title = `Fairness Passport — ${passport?.job_id ?? 'Report'}`;
    window.print();
  };

  const risk = passport?.risk_assessment;
  const dec = passport?.decision;
  const fm = passport?.fairness_summary;
  const reg = passport?.regulatory_compliance;
  const km = fm?.key_metrics ?? {};

  const diValue = Number(km.disparate_impact_ratio ?? 0);
  const diThreshold = Number(reg?.violations?.[0]?.threshold ?? 0.8);
  const diViolation = (Array.isArray(reg?.violations) && reg!.violations!.length > 0)
    || (diValue > 0 && diValue < diThreshold);
  const regLaw = reg?.framework?.name || 'EEOC 80% Rule';
  const regExplanation = reg?.violations?.[0]?.detail
    || (diViolation
      ? `Selection rate below ${diThreshold.toFixed(2)} threshold.`
      : `Selection rate meets ${diThreshold.toFixed(2)} threshold.`);
  const regRemediation = reg?.remediation_steps?.[0]
    || (diViolation
      ? 'Adjust model or justify business necessity.'
      : 'Continue monitoring and keep compliance records.');

  const riskScoreBar = Math.min((risk?.risk_score ?? 0) * 100, 100);
  const riskBarColor =
    risk?.risk_level === 'High' ? 'bg-rose-500' :
    risk?.risk_level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500';

  if (!jobId) {
    return (
      <AuditEmptyState
        variant="no-audit"
        title="Fairness Passport unavailable"
        description="Run a fairness audit first. The passport summarizes risk, metrics, and deployment guidance for this job."
      />
    );
  }

  if (loading) {
    return (
      <div className="glass-panel p-10 flex flex-col items-center justify-center gap-4 text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Generating Fairness Passport…</p>
      </div>
    );
  }

  if (error || !passport) {
    return (
      <AuditEmptyState
        variant="failed-api"
        title="Could not load Fairness Passport"
        description={error ?? 'The server did not return a valid passport.'}
        onRetry={() => {
          setError(null);
          setPassport(null);
          setFetchNonce((n) => n + 1);
        }}
        retryLabel="Reload passport"
      />
    );
  }

  return (
    <>
      {/* ── Print-only isolation styles ─────────────────────────────────── */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #fairness-passport-print { display: block !important; }
          #fairness-passport-print * { color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        #fairness-passport-print { display: block; }
      `}</style>

      <div id="passport-section" ref={printRef}
        className="space-y-6 animate-in fade-in duration-500"
      >
        <div id="fairness-passport-print"></div> {/* Keep ID for print isolation if needed, or just add it to parent */}
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="glass-panel p-8 bg-slate-900/40 border-slate-700/50 rounded-3xl">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/20 rounded-2xl">
                <FileText size={24} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">Fairness Passport</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  AI Governance Report · Job <span className="font-mono text-indigo-400">{passport.job_id.slice(0, 8)}…</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap print:hidden">
              <RiskBadge level={risk?.risk_level ?? 'Unknown'} />
              <button
                onClick={downloadJSON}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition-all"
              >
                <Download size={14} /> Download JSON
              </button>
              <button
                onClick={downloadPDF}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all"
              >
                <Printer size={14} /> Download PDF
              </button>
            </div>
          </div>

          {/* Summary highlight */}
          {dec?.summary && (
            <div className="mt-6 p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-xl flex gap-3 items-start">
              <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-indigo-200 text-sm font-medium italic">{dec.summary}</p>
            </div>
          )}
        </div>

        {/* ── Decision Card ──────────────────────────────────────────────── */}
        <Section icon={<ShieldCheck size={16} />} title="Deployment Decision">
          <DecisionBanner decision={dec ?? { status: 'Unknown', confidence: 0, reason: 'N/A', summary: 'N/A' }} />
          {/* Risk Score Bar */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
              <span>Composite Risk Score</span>
              <span className="font-mono text-white">{score(risk?.risk_score)}</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${riskBarColor}`}
                style={{ width: `${riskScoreBar}%` }}
              />
            </div>
            {risk?.components && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Disparity (50%)</p>
                  <p className="text-sm font-black text-white">{score(risk.components.disparity_component)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Proxy Risk (30%)</p>
                  <p className="text-sm font-black text-white">{score(risk.components.proxy_component)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Group Spread (20%)</p>
                  <p className="text-sm font-black text-white">{score(risk.components.spread_component)}</p>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ── Model Info ─────────────────────────────────────────────────── */}
        <Section icon={<Cpu size={16} />} title="Model Info">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricPill label="Dataset" value={passport.model_info.dataset} accent="text-sky-300" />
            <MetricPill label="Target Variable" value={passport.model_info.target} accent="text-indigo-300" />
            <MetricPill label="Use Case" value={passport.model_info.use_case} accent="text-slate-300" />
          </div>
        </Section>

        {/* ── Fairness Summary ───────────────────────────────────────────── */}
        <Section icon={<Layers size={16} />} title="Fairness Summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricPill
              label="Overall Accuracy"
              value={pct(km.overall_accuracy)}
              accent="text-emerald-400"
            />
            <MetricPill
              label="Max Disparity"
              value={pct(km.max_disparity_score)}
              accent={(km.max_disparity_score ?? 0) > 0.3 ? 'text-rose-400' : (km.max_disparity_score ?? 0) > 0.1 ? 'text-amber-400' : 'text-emerald-400'}
            />
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 col-span-2">
              <MetricStatus
                label="Disparate Impact"
                value={Number(km.disparate_impact_ratio) || 0}
                threshold={0.8}
                lowerIsWorse
                tooltip="EEOC four-fifths legal threshold. Ratios below 0.80 may be non-compliant."
              />
              <MetricStatus
                label="Max Disparity"
                value={Number(km.max_disparity_score) || 0}
                threshold={0.2}
                tooltip="General fairness policy threshold. Scores above 0.20 indicate elevated risk."
                className="mt-2"
              />
            </div>
            <MetricPill
              label="Groups Affected"
              value={String(km.affected_group_count ?? fm?.affected_groups?.length ?? 0)}
              accent={(km.affected_group_count ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}
            />
          </div>
          {(fm?.affected_groups?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Affected Groups</p>
              <div className="flex flex-wrap gap-2">
                {fm!.affected_groups.map(g => (
                  <span key={g} className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-full">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
          {fm?.disparity_by_attribute && Object.keys(fm.disparity_by_attribute).length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Disparity by Attribute</p>
              {Object.entries(fm.disparity_by_attribute).map(([attr, val]) => (
                <div key={attr} className="flex items-center gap-3">
                  <span className="w-28 text-sm text-slate-400 capitalize truncate">{attr}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${val > 0.3 ? 'bg-rose-500' : val > 0.1 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(val * 100, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-white w-12 text-right">{pct(val)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Regulatory Snapshot ─────────────────────────────────────────── */}
        <Section icon={<AlertTriangle size={16} />} title="Regulatory Snapshot">
          <div
            className={`rounded-2xl border p-5 space-y-4 ${
              diViolation
                ? 'bg-rose-500/10 border-rose-500/35'
                : 'bg-emerald-500/10 border-emerald-500/30'
            }`}
          >
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-200">
                Law: <span className="text-white">{regLaw}</span>
              </p>
              <p className="text-sm font-bold text-slate-200">
                Metric: <span className="text-white">Disparate Impact = {diValue.toFixed(2)}</span>
              </p>
              <p className="text-sm font-bold text-slate-200">
                Threshold: <span className="text-white">{diThreshold.toFixed(2)}</span>
              </p>
            </div>

            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider ${
                diViolation
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              }`}
            >
              {diViolation ? (
                <>
                  <ShieldX size={14} /> ❌ Violation Detected
                </>
              ) : (
                <>
                  <ShieldCheck size={14} /> ✅ No Immediate Violation
                </>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-slate-200">
                <span className="font-black text-slate-400 uppercase text-[10px] tracking-widest mr-2">Explanation</span>
                {regExplanation}
              </p>
              <p className="text-slate-200">
                <span className="font-black text-slate-400 uppercase text-[10px] tracking-widest mr-2">Remediation</span>
                {regRemediation}
              </p>
            </div>
          </div>
        </Section>

        {/* ── Proxy Risks ────────────────────────────────────────────────── */}
        <Section icon={<AlertTriangle size={16} />} title="Proxy Risks">
          {passport.proxy_risks.length === 0 ? (
            <div className="flex items-center gap-3 text-emerald-400">
              <CheckCircle size={16} />
              <span className="text-sm font-medium">No high-risk proxy variables detected.</span>
            </div>
          ) : (
            <div>
              {passport.proxy_risks.map((p, i) => <ProxyRow key={i} p={p} />)}
            </div>
          )}
        </Section>

        {/* ── Mitigation Impact ──────────────────────────────────────────── */}
        <Section icon={<TrendingDown size={16} />} title="Mitigation Impact">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricPill
              label="Bias Reduction"
              value={`${(passport.mitigation.bias_reduction_pct ?? 0).toFixed(1)}%`}
              accent="text-emerald-400"
            />
            <MetricPill
              label="Accuracy Tradeoff"
              value={`${(passport.mitigation.accuracy_tradeoff_pct ?? 0).toFixed(1)}%`}
              accent={(passport.mitigation.accuracy_tradeoff_pct ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400'}
            />
            <MetricPill
              label="Methods Applied"
              value={String(passport.mitigation.methods_applied.length)}
              accent="text-white"
            />
          </div>
          {passport.mitigation.impact_summary && (
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">{passport.mitigation.impact_summary}</p>
          )}
          {passport.mitigation.methods_applied.length > 0 && (
            <ul className="mt-3 space-y-1">
              {passport.mitigation.methods_applied.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-400">
                  <CheckCircle size={12} className="text-indigo-400 shrink-0" /> {m}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── AI Insights ────────────────────────────────────────────────── */}
        {passport.ai_insights && passport.ai_insights !== 'N/A' && (
          <Section icon={<Info size={16} />} title="AI Auditor Insights" defaultOpen={false}>
            <p className="text-slate-300 text-sm leading-relaxed italic">"{passport.ai_insights}"</p>
          </Section>
        )}

        {/* ── Audit Timeline ─────────────────────────────────────────────── */}
        <Section icon={<Clock size={16} />} title="Audit Timeline" defaultOpen={false}>
          <div className="relative pl-5 border-l border-slate-800 space-y-5">
            {(passport.audit_trace.timestamped_events ?? []).map((ev, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-indigo-500 bg-slate-950" />
                <TraceItem event={ev} />
              </div>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-600 font-mono pt-2 print:pt-4">
          FairLens Studio v2 · Schema {passport.schema_version} · Generated {new Date(passport.model_info.created_at).toLocaleString()}
        </p>
      </div>
    </>
  );
}
