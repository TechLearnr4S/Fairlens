import { useAuditStore } from '../../store/auditStore';
import FairnessPassport from '../../components/audit/FairnessPassport';
import AuditIntegrity from '../../components/audit/AuditIntegrity';
import { ShieldCheck, FileLock, Search } from 'lucide-react';

export default function Passports() {
  const { jobId, currentFile } = useAuditStore();

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400 tracking-tight">
            Fairness Passports
          </h1>
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
        <div className="glass-panel p-20 text-center space-y-6">
          <div className="w-20 h-20 bg-dark-800 rounded-full flex items-center justify-center mx-auto border border-slate-700 shadow-inner">
            <FileLock size={40} className="text-slate-600" />
          </div>
          <div className="max-w-md mx-auto">
            <h2 className="text-xl font-bold text-white mb-2">No Active Audit Found</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Passports are generated dynamically after a fairness audit is completed. Start a new audit to generate a verifiable report.
            </p>
            <button 
              onClick={() => window.location.href = '/new-audit'}
              className="px-8 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-primary-900/20 transition-all hover:scale-105"
            >
              Start New Audit
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-12">
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

