import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Download, Filter, History as HistoryIcon, Play, RotateCcw, FileCheck } from 'lucide-react';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { useAuditStore } from '../../store/auditStore';
import { useToast } from '../../components/providers/ToastProvider';

type AuditHistoryItem = {
  job_id: string;
  filename: string;
  upload_time?: string;
  analysis_time?: string;
  has_results?: boolean;
  risk_level?: string;
};

function riskClass(level: string) {
  if (level === 'High' || level === 'Critical') return 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30';
  if (level === 'Medium') return 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30';
  if (level === 'Low') return 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

export default function History() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const activeJobId = useAuditStore((s) => s.jobId);

  const [audits, setAudits] = useState<AuditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch('http://localhost:8000/audits/recent')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Could not load audit history.')))
      .then((data) => setAudits(Array.isArray(data?.audits) ? data.audits : []))
      .catch((err) => {
        if (!isRequestTimeout(err)) setError(err instanceof Error ? err.message : 'Could not load audit history.');
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    return audits.filter((audit) => {
      const risk = audit.risk_level ?? (audit.has_results ? 'Medium' : 'Unknown');
      if (riskFilter !== 'all' && risk !== riskFilter) return false;
      if (dateFilter === '7d' || dateFilter === '30d') {
        const ts = new Date(audit.analysis_time || audit.upload_time || '').getTime();
        if (!Number.isFinite(ts)) return false;
        const limit = dateFilter === '7d' ? 7 : 30;
        return now - ts <= limit * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [audits, dateFilter, riskFilter]);

  const downloadPassport = useCallback(async (jobId: string) => {
    setDownloadingId(jobId);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/passport`);
      if (!res.ok) {
        addToast('Could not fetch passport for this audit.', 'error');
        return;
      }
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FairLens_Passport_${jobId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Passport downloaded successfully.', 'success');
    } catch {
      addToast('Download failed. Please try again.', 'error');
    } finally {
      setDownloadingId(null);
    }
  }, [addToast]);

  /** Navigate to results for this audit.
   * If the audit matches the currently active in-memory session → go to dashboard.
   * Otherwise, download the passport (the only persisted artifact) and explain why. */
  const handleViewResults = useCallback(async (audit: AuditHistoryItem) => {
    if (audit.job_id === activeJobId) {
      navigate('/');
      return;
    }
    // Session is not active — download passport as the best available artifact
    addToast('This session is no longer live. Downloading the Fairness Passport instead.', 'info');
    await downloadPassport(audit.job_id);
  }, [activeJobId, navigate, addToast, downloadPassport]);

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8B5CF6]">Audit History</p>
          <h1 className="mt-2 text-4xl font-black text-white">Saved governance record</h1>
          <p className="mt-2 text-sm text-[#9CA3AF]">Review prior audits, download passports, or rerun an assessment.</p>
        </div>
        <button
          onClick={() => navigate('/new-audit')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500"
        >
          <Play size={16} /> New Audit
        </button>
      </header>

      <section className="rounded-3xl border border-white/[0.08] bg-[#111827] p-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <HistoryIcon className="text-indigo-400" size={20} />
            <h2 className="font-black text-white">All audits</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300">
              <Filter size={14} /> Risk
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="bg-transparent text-white outline-none">
                <option value="all">All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300">
              <Calendar size={14} /> Date
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="bg-transparent text-white outline-none">
                <option value="all">All</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-800" />)}</div>
        ) : error ? (
          <div className="rounded-2xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-5 text-sm text-rose-100">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-[#0B1220] p-8 text-center space-y-3">
            <HistoryIcon className="mx-auto text-slate-600" size={32} />
            <p className="text-[#9CA3AF]">No audits match the selected filters.</p>
            <button
              onClick={() => navigate('/new-audit')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
            >
              <Play size={14} /> Start New Audit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((audit) => {
              const risk = audit.risk_level ?? (audit.has_results ? 'Medium' : 'Unknown');
              const isActive = audit.job_id === activeJobId;
              const isDownloading = downloadingId === audit.job_id;
              return (
                <div
                  key={audit.job_id}
                  className={`grid gap-4 rounded-2xl border bg-[#0B1220] p-4 transition hover:border-indigo-500/40 lg:grid-cols-[1.5fr_1fr_0.7fr_1.1fr] lg:items-center ${
                    isActive ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-white/[0.08]'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white">{audit.filename || 'Untitled audit'}</p>
                      {isActive && (
                        <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-300">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-500">{audit.job_id.slice(0, 8)}...</p>
                  </div>
                  <p className="text-sm text-[#9CA3AF]">
                    {audit.analysis_time || audit.upload_time
                      ? new Date(audit.analysis_time || audit.upload_time || '').toLocaleString()
                      : 'No date'}
                  </p>
                  <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${riskClass(risk)}`}>
                    {risk}
                  </span>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      onClick={() => void handleViewResults(audit)}
                      className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                    >
                      <FileCheck size={13} /> {isActive ? 'View Results' : 'View Passport'}
                    </button>
                    <button
                      onClick={() => void downloadPassport(audit.job_id)}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      <Download size={13} /> {isDownloading ? 'Saving…' : 'Download'}
                    </button>
                    <button
                      onClick={() => navigate('/new-audit')}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                    >
                      <RotateCcw size={13} /> Re-run
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
