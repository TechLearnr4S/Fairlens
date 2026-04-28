import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Download, Filter, History as HistoryIcon, Play, RotateCcw } from 'lucide-react';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';

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
  const [audits, setAudits] = useState<AuditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

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

  const downloadPassport = async (jobId: string) => {
    const res = await apiFetch(`http://localhost:8000/audits/${jobId}/passport`);
    if (!res.ok) return;
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FairLens_Passport_${jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <div className="rounded-2xl border border-slate-800 bg-[#0B1220] p-8 text-center text-[#9CA3AF]">No audits match the selected filters.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((audit) => {
              const risk = audit.risk_level ?? (audit.has_results ? 'Medium' : 'Unknown');
              return (
                <div key={audit.job_id} className="grid gap-4 rounded-2xl border border-white/[0.08] bg-[#0B1220] p-4 transition hover:border-indigo-500/40 lg:grid-cols-[1.5fr_1fr_0.7fr_1.1fr] lg:items-center">
                  <div>
                    <p className="font-bold text-white">{audit.filename || 'Untitled audit'}</p>
                    <p className="text-xs font-mono text-slate-500">{audit.job_id.slice(0, 8)}...</p>
                  </div>
                  <p className="text-sm text-[#9CA3AF]">{audit.analysis_time || audit.upload_time ? new Date(audit.analysis_time || audit.upload_time || '').toLocaleString() : 'No date'}</p>
                  <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${riskClass(risk)}`}>{risk}</span>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button onClick={() => navigate('/')} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">View Results</button>
                    <button onClick={() => void downloadPassport(audit.job_id)} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"><Download size={13} /> Passport</button>
                    <button onClick={() => navigate('/new-audit')} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"><RotateCcw size={13} /> Re-run</button>
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
