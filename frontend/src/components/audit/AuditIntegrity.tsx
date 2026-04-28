import { useCallback, useState } from 'react';
import {
  ShieldCheck, ShieldX, ShieldAlert,
  Lock, CheckCircle2, XCircle, Clock,
  Hash, Link2, KeyRound, Loader2,
  ChevronDown, ChevronUp, AlertTriangle, RefreshCw, X,
} from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { FETCH_WITH_TIMEOUT_MS } from '../../utils/fetchWithTimeout';
import { unwrapAuditBody } from '../../utils/auditEnvelope';
import { AuditEmptyState } from '../ui/AuditEmptyState';

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

type VerifyResponse = Partial<VerifyReport> & {
  reason?: string;
};

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

const normalizeVerifyReport = (data: VerifyResponse, jobId: string): VerifyReport => {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const brokenAt = typeof data.broken_at === 'number' ? data.broken_at : null;
  const isValid = typeof data.is_valid === 'boolean' ? data.is_valid : true;
  const totalEntries = typeof data.total_entries === 'number' ? data.total_entries : steps.length;
  const checksPassed = typeof data.checks_passed === 'number'
    ? data.checks_passed
    : (isValid ? totalEntries : Math.max(totalEntries - 1, 0));
  const checksFailed = typeof data.checks_failed === 'number'
    ? data.checks_failed
    : Math.max(totalEntries - checksPassed, 0);

  return {
    job_id: data.job_id ?? jobId,
    is_valid: isValid,
    broken_at: brokenAt,
    total_entries: totalEntries,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
    steps,
    failure: data.failure ?? (brokenAt !== null
      ? {
          index: brokenAt,
          reason: data.reason ?? 'Audit integrity verification failed.',
        }
      : null),
    summary: data.summary ?? data.reason ?? (isValid
      ? 'Audit integrity verified.'
      : 'Audit integrity verification failed.'),
  };
};

const VERIFY_TIMEOUT_HINT = `No response within ${FETCH_WITH_TIMEOUT_MS / 1000}s. Check that the API is running, then try again.`;

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

  const [report, setReport]           = useState<VerifyReport | null>(null);
  const [verifying, setVerifying]     = useState(false);
  const [tampering, setTampering]     = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [tamperError, setTamperError] = useState<string | null>(null);
  const [tamperSuccessBanner, setTamperSuccessBanner] = useState<string | null>(null);
  const [showTamperConfirm, setShowTamperConfirm]     = useState(false);
  const [verifiedAt, setVerifiedAt]   = useState<string | null>(null);
  const [showSteps, setShowSteps]     = useState(false);

  const busy = verifying || tampering;

  const runVerification = useCallback(async () => {
    if (!jobId) return;
    setVerifying(true);
    setVerifyError(null);
    setReport(null);

    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/verify`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      let data: VerifyResponse;
      try { data = unwrapAuditBody(await res.json()); } catch { throw new Error('Invalid JSON response'); }
      setReport(normalizeVerifyReport(data, jobId));
      setVerifiedAt(new Date().toLocaleString());
    } catch (e: unknown) {
      if (isRequestTimeout(e)) {
        setVerifyError(VERIFY_TIMEOUT_HINT);
      } else {
        setVerifyError(e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      setVerifying(false);
    }
  }, [jobId]);

  const openTamperConfirm = () => {
    if (!jobId || busy) return;
    setTamperError(null);
    setTamperSuccessBanner(null);
    setShowTamperConfirm(true);
  };

  const cancelTamperConfirm = () => setShowTamperConfirm(false);

  const executeTamper = useCallback(async () => {
    if (!jobId) return;
    setShowTamperConfirm(false);
    setTampering(true);
    setTamperError(null);
    setTamperSuccessBanner(null);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/tamper`, { method: 'POST' });
      if (!res.ok) throw new Error('Tamper simulation failed');
      setTamperSuccessBanner('Tampering complete. The local audit hash chain was modified for demonstration.');
      await runVerification();
    } catch (e: unknown) {
      if (isRequestTimeout(e)) {
        setTamperError(VERIFY_TIMEOUT_HINT);
      } else {
        setTamperError(e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      setTampering(false);
    }
  }, [jobId, runVerification]);

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
            type="button"
            onClick={openTamperConfirm}
            disabled={busy || !jobId}
            className={`
              flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-black
              transition-all border bg-slate-900/50 border-rose-500/30 text-rose-400 hover:bg-rose-500/10
              ${(busy || !jobId) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {tampering ? (
              <><Loader2 size={14} className="animate-spin" /> Applying…</>
            ) : (
              <><AlertTriangle size={14} /> Simulate Tampering</>
            )}
          </button>

          <button
            id="verify-audit-trail-btn"
            type="button"
            onClick={() => void runVerification()}
            disabled={busy || !jobId}
            className={`
              flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-black
              transition-all duration-200 border
              ${busy
                ? 'bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed'
                : !jobId
                ? 'bg-slate-800/50 border-slate-700/50 text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30'
              }
            `}
          >
            {verifying
              ? <><Loader2 size={16} className="animate-spin" /> Verifying…</>
              : <><ShieldCheck size={16} /> Verify Audit Trail</>
            }
          </button>
        </div>
      </div>

      {showTamperConfirm && jobId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tamper-confirm-title"
          className="mb-6 p-5 rounded-2xl border border-rose-500/35 bg-rose-950/40 text-left space-y-4 print:hidden"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
              <AlertTriangle className="text-rose-400" size={20} aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <h3 id="tamper-confirm-title" className="text-sm font-black text-rose-100 uppercase tracking-wide">
                Confirm tamper simulation
              </h3>
              <p className="text-sm text-rose-200/90 leading-relaxed">
                This will intentionally modify stored audit data so the hash chain fails verification—only for
                learning how integrity checks behave. Do not use on production data you need to preserve.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-end">
            <button
              type="button"
              onClick={cancelTamperConfirm}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void executeTamper()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/50 shadow-lg shadow-rose-900/20 transition-colors"
            >
              <AlertTriangle size={14} /> Confirm &amp; tamper
            </button>
          </div>
        </div>
      )}

      {tamperSuccessBanner && jobId && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 text-left print:hidden">
          <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={20} aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-100">{tamperSuccessBanner}</p>
            <p className="text-xs text-slate-400 mt-1">Results below refresh from the verifier.</p>
          </div>
          <button
            type="button"
            onClick={() => setTamperSuccessBanner(null)}
            className="shrink-0 p-1.5 rounded-lg text-emerald-400/80 hover:bg-emerald-500/15 hover:text-emerald-200 transition-colors"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {tamperError && jobId && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-2xl border border-rose-500/35 bg-rose-500/10 text-left space-y-3 print:hidden"
        >
          <p className="text-sm text-rose-100 flex items-start gap-2">
            <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={16} aria-hidden />
            <span>{tamperError}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void executeTamper()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-500/40 disabled:opacity-50"
            >
              <RefreshCw size={14} /> Retry tamper
            </button>
            <button
              type="button"
              onClick={() => setTamperError(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {jobId && !hasReport && verifying && (
        <div className="flex items-center gap-3 p-4 mb-4 rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-100 text-sm print:hidden">
          <Loader2 className="animate-spin shrink-0 text-indigo-400" size={18} aria-hidden />
          <span>Verifying hash chain and signatures…</span>
        </div>
      )}

      {!jobId && !hasReport && (
        <AuditEmptyState
          variant="no-audit"
          title="Integrity verification locked"
          description="Run an audit first. The verifier checks tamper-evident hashing for this job."
          compact
          className="my-4"
        />
      )}

      {jobId && verifyError && !hasReport && !verifying && (
        <AuditEmptyState
          variant="failed-api"
          title="Verification request failed"
          description={verifyError}
          onRetry={() => void runVerification()}
          retryLabel="Try verification again"
          compact
          className="my-4"
        />
      )}

      {jobId && !hasReport && !verifying && !verifyError && (
        <AuditEmptyState
          variant="missing-data"
          title="Audit trail not verified yet"
          description="Compute hash-chain validity for your job’s persisted steps."
          cta={{ label: 'Verify audit trail', onClick: () => void runVerification() }}
          icon={ShieldAlert}
          compact
          className="my-4 border border-slate-700/60"
        />
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
