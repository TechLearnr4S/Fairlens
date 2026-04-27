import React from 'react';
import { useAuditStore } from '../../store/auditStore';
import AuditComments from '../../features/comments/AuditComments';
import { Users, MessageSquare, Globe, Shield } from 'lucide-react';

export default function Teams() {
  const { jobId, currentFile } = useAuditStore();

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-violet-400 tracking-tight">
            Team Collaboration
          </h1>
          <p className="text-slate-400 mt-2 font-medium">
            Discuss audit findings, resolve bias flags, and coordinate mitigation strategies with your team.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {!jobId ? (
            <div className="glass-panel p-20 text-center space-y-6">
              <div className="w-20 h-20 bg-dark-800 rounded-full flex items-center justify-center mx-auto border border-slate-700 shadow-inner">
                <Users size={40} className="text-slate-600" />
              </div>
              <div className="max-w-md mx-auto">
                <h2 className="text-xl font-bold text-white mb-2">No Active Audit Session</h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-8">
                  Collaboration threads are tied to specific audit jobs. Please select or start an audit to participate in discussions.
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
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="text-primary-400" size={18} />
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Active Discussion for {currentFile?.name}</h3>
                </div>
              </div>
              <AuditComments jobId={jobId} />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6 border-slate-800 bg-slate-900/20">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Globe size={16} className="text-indigo-400" />
              Organization Visibility
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-slate-700">
                <span className="text-xs text-slate-300">Public Access</span>
                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] font-black rounded border border-rose-500/20 uppercase">Disabled</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-slate-700">
                <span className="text-xs text-slate-300">Team Visibility</span>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded border border-emerald-500/20 uppercase">Internal Only</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-4 leading-relaxed">
              * Governance policies enforce that all bias discussions remain within the authorized auditor group.
            </p>
          </div>

          <div className="glass-panel p-6 border-slate-800 bg-slate-900/20">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Shield size={16} className="text-emerald-400" />
              Audit Permissions
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-dark-800 flex items-center justify-center text-[10px] font-bold text-slate-400">ADM</div>
                <div>
                  <p className="text-xs font-bold text-white">Admin Group</p>
                  <p className="text-[10px] text-slate-500">Full Access · 3 Members</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-dark-800 flex items-center justify-center text-[10px] font-bold text-slate-400">AUD</div>
                <div>
                  <p className="text-xs font-bold text-white">Auditor Group</p>
                  <p className="text-[10px] text-slate-500">Write Access · 12 Members</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
