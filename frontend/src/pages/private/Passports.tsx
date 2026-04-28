import { useAuditStore } from '../../store/auditStore';
import FairnessPassport from '../../components/audit/FairnessPassport';
import AuditIntegrity from '../../components/audit/AuditIntegrity';
import { Award, FileLock, Scale, Search, ShieldCheck } from 'lucide-react';
import { AuditEmptyState } from '../../components/ui/AuditEmptyState';

export default function Passports() {
  const { jobId, currentFile, auditSummary } = useAuditStore();
  const law = auditSummary?.law ?? 'Applicable fairness framework';
  const metric = 'Disparate Impact';
  const threshold = '0.80';
  const value = Number(auditSummary?.disparity ?? 1);
  const violation = value < 0.8;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8B5CF6]">Compliance documents</p>
          <h1 className="mt-2 text-4xl font-black text-white tracking-tight">Fairness Passports</h1>
          <p className="text-slate-400 mt-2 font-medium">
            Verifiable governance reports and cryptographic audit trails for your models.
          </p>
        </div>
        
        {jobId && (
          <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
              Active Session: {currentFile?.name}
            </span>
          </div>
        )}
      </header>

      {!jobId ? (
        <AuditEmptyState
          variant="no-audit"
          title="No active passport"
          description="Run an audit to generate an official compliance document with law, metric, threshold, violation status, and digital signature proof."
          icon={FileLock}
          ctaHref="/new-audit"
          ctaLabel="Start audit"
        />
      ) : (
        <div className="grid grid-cols-1 gap-12">
          <section className="rounded-3xl border border-white/[0.08] bg-[#F8FAFC] p-8 text-slate-900 shadow-2xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-700">Official compliance certificate</p>
                <h2 className="mt-2 text-3xl font-black">FairLens Governance Passport</h2>
                <p className="mt-2 text-sm text-slate-600">Dataset: {currentFile?.name ?? 'Current audit dataset'}</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 text-sm font-black uppercase tracking-widest ${violation ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                {violation ? 'Violation likely' : 'Within threshold'}
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <Scale size={18} className="text-indigo-600" />
                <p className="mt-3 text-xs font-black uppercase text-slate-500">Law</p>
                <p className="mt-1 text-sm font-bold">{law}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase text-slate-500">Metric</p>
                <p className="mt-2 text-xl font-black">{metric}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase text-slate-500">Threshold</p>
                <p className="mt-2 text-xl font-black">{threshold}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase text-slate-500">Observed</p>
                <p className="mt-2 text-xl font-black">{value.toFixed(2)}</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <Award className="text-indigo-600" size={22} />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Digital signature block</p>
                  <p className="mt-1 font-mono text-xs text-slate-600">SHA256: FL-{jobId.slice(0, 8).toUpperCase()}-DEMO-SIGNATURE · Ed25519 verified for demo certificate</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="text-emerald-400" size={20} />
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Compliance Certificate</h3>
            </div>
            <FairnessPassport />
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Search className="text-indigo-400" size={20} />
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Blockchain-Ready Audit Ledger</h3>
            </div>
            <AuditIntegrity />
          </section>
        </div>
      )}
    </div>
  );
}

