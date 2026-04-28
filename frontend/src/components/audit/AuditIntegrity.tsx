import { useState } from 'react';
import {
  ShieldCheck, ShieldX, ShieldAlert,
  Lock, CheckCircle2, XCircle, Clock,
  Hash, Link2, KeyRound, Loader2,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepChecks {
  hash_valid: boolean;
  chain_linked: boolean;
  signature_valid: boolean | null; // null = unsigned entry
}

interface VerifyStep {
  index: number;
  log_id: string;
  action: string;
  timestamp: string;
  hash_stored: string;
  checks: StepChecks;
  passed: boolean;
  failure_reason: string | null;
}

interface FailureDetail {
  index: number;
  log_id?: string;
  action?: string;
  timestamp?: string;
  reason: string;
}

interface VerifyReport {
  job_id: string;
  is_valid: boolean;
  broken_at: number | null;
  total_entries: number;
  checks_passed: number;
  checks_failed: number;
  steps: VerifyStep[];
  failure: FailureDetail | null;
  summary: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  DATASET_UPLOADED:      'Dataset Uploaded',
  FAIRNESS_RUN:          'Fairness Analysis',
  PROXY_DETECTION:       'Proxy Detection',
  SIMULATION_APPLIED:    'Bias Simulation',
  EXPLANATION_GENERATED: 'AI Explanation',
  PASSPORT_GENERATED:    'Passport Generated',
};

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function CheckIcon({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-slate-500 text-xs font-mono">—</span>;
  return value
    ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
    : <XCircle size={14} className="text-rose-400 shrink-0" />;
}

function StepRow({ step, index }: { step: VerifyStep; index: number }) {
  const [open, setOpen] = useState(false);
  const label = ACTION_LABELS[step.action] ?? step.action;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      step.passed ? 'border-slate-800' : 'border-rose-500/30 bg-rose-500/5'
    }`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
      >
        {/* Index */}
        <span className="text-[10px] font-mono text-slate-600 w-5 shrink-0">#{index}</span>

        {/* Pass/Fail indicator */}
        <span className={`shrink-0 w-2 h-2 rounded-full ${step.passed ? 'bg-emerald-500' : 'bg-rose-500'}`} />

        {/* Action label */}
        <span className="flex-1 text-sm font-semibold text-slate-200">{label}</span>

        {/* Timestamp */}
        <span className="text-[10px] text-slate-500 font-mono hidden sm:block">{fmt(step.timestamp)}</span>

        {/* Check indicators */}
        <div className="flex items-center gap-2 ml-2">
          <CheckIcon value={step.checks.hash_valid} />
          <CheckIcon value={step.checks.chain_linked} />
          <CheckIcon value={step.checks.signature_valid} />
        </div>

        {open ? <ChevronUp size={14} className="text-slate-500 ml-1" /> : <ChevronDown size={14} className="text-slate-500 ml-1" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-800/60">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Hash size={12} className="text-slate-500" />
              <span className="text-slate-400">Hash</span>
              <CheckIcon value={step.checks.hash_valid} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Link2 size={12} className="text-slate-500" />
              <span className="text-slate-400">Chain</span>
              <CheckIcon value={step.checks.chain_linked} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <KeyRound size={12} className="text-slate-500" />
              <span className="text-slate-400">Sig</span>
              <CheckIcon value={step.checks.signature_valid} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 font-mono truncate">hash: {step.hash_stored}</p>
          {step.failure_reason && (
            <p className="text-xs text-rose-400 flex items-start gap-2">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {step.failure_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AuditIntegrity() {
  const { jobId } = useAuditStore();

  const [report, setReport]         = useState<VerifyReport | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [showSteps, setShowSteps]   = useState(false);

  const runVerification = async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch(`http://localhost:8000/audits/${jobId}/verify`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      let data: VerifyReport;
      try { data = await res.json(); } catch { throw new Error('Invalid JSON response'); }
      setReport(data);
      setVerifiedAt(new Date().toLocaleString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleTamper = async () => {
    if (!jobId) return;
    if (!window.confirm("Warning: This will maliciously modify the local database to demonstrate integrity failure. Proceed?")) return;
    
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/audits/${jobId}/tamper`, { method: 'POST' });
      if (!res.ok) throw new Error("Tamper simulation failed");
      alert("Tampering complete. The hash chain has been broken.");
      runVerification(); // Refresh the status
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const isValid   = report?.is_valid ?? null;
  const hasReport = report !== null;

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #audit-integrity-print { display: block !important; }
        }
        #audit-integrity-print { display: block; }
      `}</style>

    <div id="audit-integrity-print" className="glass-panel p-8 bg-slate-900/40 border-slate-700/50 rounded-3xl overflow-hidden">

      {/* ── Section Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/15 rounded-2xl">
            <Lock size={22} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Audit Integrity</h2>
            <p className="text-slate-500 text-xs mt-0.5 uppercase tracking-widest font-bold">
              Hash-Chained · Local Persistence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <button
            id="tamper-simulation-btn"
            onClick={handleTamper}
            disabled={loading || !jobId}
            className={`
              flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-black
              transition-all border bg-slate-900/50 border-rose-500/30 text-rose-400 hover:bg-rose-500/10
              ${(loading || !jobId) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <AlertTriangle size={14} /> Simulate Tampering
          </button>

          <button
            id="verify-audit-trail-btn"
            onClick={runVerification}
            disabled={loading || !jobId}
            className={`
              flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-black
              transition-all duration-200 border
              ${loading
                ? 'bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed'
                : !jobId
                ? 'bg-slate-800/50 border-slate-700/50 text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30'
              }
            `}
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> Verifying…</>
              : <><ShieldCheck size={16} /> Verify Audit Trail</>
            }
          </button>
        </div>
      </div>

      {/* ── Error State ────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
          <ShieldX size={18} className="text-rose-400 shrink-0" />
          <p className="text-rose-300 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* ── No Job Prompt ──────────────────────────────────────────────────── */}
      {!jobId && !hasReport && (
        <div className="py-10 flex flex-col items-center justify-center text-slate-600 gap-3">
          <Lock size={36} className="opacity-30" />
          <p className="text-sm">Run an audit first to enable integrity verification.</p>
        </div>
      )}

      {/* ── Idle prompt ────────────────────────────────────────────────────── */}
      {jobId && !hasReport && !loading && !error && (
        <div className="py-10 flex flex-col items-center justify-center text-slate-500 gap-3">
          <ShieldAlert size={36} className="opacity-40" />
          <p className="text-sm">Click <strong className="text-slate-300">Verify Audit Trail</strong> to check chain integrity.</p>
        </div>
      )}

      {/* ── Result Panel ───────────────────────────────────────────────────── */}
      {hasReport && report && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* Status Banner */}
          <div className={`
            rounded-2xl border p-6 flex flex-col md:flex-row items-start md:items-center gap-5
            ${isValid
              ? 'bg-emerald-500/8 border-emerald-500/25'
              : 'bg-rose-500/8 border-rose-500/25'
            }
          `}>
            <div className={`p-3 rounded-2xl shrink-0 ${isValid ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
              {isValid
                ? <ShieldCheck size={28} className="text-emerald-400" />
                : <ShieldX size={28} className="text-rose-400" />
              }
            </div>

            <div className="flex-1">
              {/* Main Badge */}
              <div className={`
                inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-black uppercase tracking-widest mb-2
                ${isValid
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                }
              `}>
                {isValid
                  ? <><CheckCircle2 size={14} /> Integrity Verified</>
                  : <><XCircle size={14} /> Tampering Detected</>
                }
              </div>

              {/* Summary text */}
              <p className="text-slate-300 text-sm leading-relaxed">{report.summary}</p>

              {/* Failure callout */}
              {!isValid && report.failure && (
                <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 font-mono">
                  <span className="font-black text-rose-400">Entry #{report.broken_at}</span>
                  {' · '}{report.failure.action}
                  {' · '}{report.failure.reason}
                </div>
              )}
            </div>

            {/* Confidence chip */}
            <div className="text-right shrink-0">
              <p className={`text-2xl font-black font-mono ${isValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isValid ? '100%' : `${Math.round((report.checks_passed / Math.max(report.total_entries, 1)) * 100)}%`}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Integrity</p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Logs</p>
              <p className="text-2xl font-black text-white">{report.total_entries}</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Passed</p>
              <p className="text-2xl font-black text-emerald-400">{report.checks_passed}</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Failed</p>
              <p className={`text-2xl font-black ${report.checks_failed > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                {report.checks_failed}
              </p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Broken At</p>
              <p className={`text-2xl font-black ${report.broken_at !== null ? 'text-rose-400' : 'text-slate-500'}`}>
                {report.broken_at !== null ? `#${report.broken_at}` : '—'}
              </p>
            </div>
          </div>

          {/* Last verified timestamp */}
          {verifiedAt && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock size={12} />
              <span>Last verified: <span className="text-slate-300 font-mono">{verifiedAt}</span></span>
            </div>
          )}

          {/* Per-step log detail toggle */}
          {report.steps.length > 0 && (
            <div>
              <button
                onClick={() => setShowSteps(s => !s)}
                className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white uppercase tracking-widest transition-colors mb-3"
              >
                {showSteps ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showSteps ? 'Hide' : 'Show'} Step-by-Step Log ({report.steps.length} entries)
              </button>

              {showSteps && (
                <div className="space-y-2 animate-in fade-in duration-200">
                  {/* Column headers */}
                  <div className="flex items-center gap-3 px-4 pb-1 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    <span className="w-5 shrink-0">#</span>
                    <span className="w-2 shrink-0" />
                    <span className="flex-1">Action</span>
                    <div className="flex gap-6 mr-4 hidden sm:flex">
                      <span className="flex items-center gap-1"><Hash size={10} />Hash</span>
                      <span className="flex items-center gap-1"><Link2 size={10} />Chain</span>
                      <span className="flex items-center gap-1"><KeyRound size={10} />Sig</span>
                    </div>
                  </div>
                  {report.steps.map((step) => (
                    <StepRow key={step.log_id} step={step} index={step.index} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Print-only integrity certificate footer ────────────────────────── */}
      {report && (
        <div className="hidden print:block mt-8 pt-6 border-t border-slate-700">
          <p className="text-xs text-slate-500 font-mono">
            FairLens Studio · Audit Integrity Proof · Job {report.job_id}
          </p>
          <p className="text-xs text-slate-500 font-mono">
            Generated: {verifiedAt} · Algorithm: Ed25519 + SHA-256
          </p>
          <p className={`text-sm font-black mt-2 ${
            report.is_valid ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {report.is_valid ? '✓ Integrity Proof: Verified' : '✗ Integrity Proof: FAILED'}
          </p>
        </div>
      )}
    </div>
    </>
  );
}
