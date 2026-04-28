import { useMemo, useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import AuditComments from '../../features/comments/AuditComments';
import { Lock, MessageSquare, Plus } from 'lucide-react';

type Space = {
  id: string;
  name: string;
  description: string;
  visibility: 'Private' | 'Team';
  members: { name: string; role: 'Admin' | 'Auditor' }[];
  activeAudits: number;
  lastActivity: string;
};

const seedSpaces: Space[] = [
  {
    id: 'governance',
    name: 'Governance Review',
    description: 'Cross-functional review space for high-risk audit findings.',
    visibility: 'Team',
    members: [
      { name: 'Daksh', role: 'Admin' },
      { name: 'AI Auditor', role: 'Auditor' },
      { name: 'Compliance Lead', role: 'Auditor' },
    ],
    activeAudits: 2,
    lastActivity: '12 min ago',
  },
];

export default function Teams() {
  const { jobId, currentFile } = useAuditStore();
  const [spaces, setSpaces] = useState<Space[]>(seedSpaces);
  const [selectedId, setSelectedId] = useState(spaces[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<'Discussions' | 'Audits' | 'Members'>('Discussions');
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', visibility: 'Private' as Space['visibility'] });
  const selected = useMemo(() => spaces.find((s) => s.id === selectedId) ?? spaces[0], [selectedId, spaces]);

  const createSpace = () => {
    if (!draft.name.trim()) return;
    const space: Space = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      description: draft.description.trim() || 'Workspace for audit governance.',
      visibility: draft.visibility,
      members: [{ name: 'Daksh', role: 'Admin' }],
      activeAudits: jobId ? 1 : 0,
      lastActivity: 'Just now',
    };
    setSpaces((prev) => [space, ...prev]);
    setSelectedId(space.id);
    setDraft({ name: '', description: '', visibility: 'Private' });
    setShowCreate(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8B5CF6]">Workspace system</p>
          <h1 className="mt-2 text-4xl font-black text-white tracking-tight">Team Collaboration</h1>
          <p className="text-slate-400 mt-2 font-medium">Create review spaces, discuss audit findings, and manage governance roles.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500">
          <Plus size={16} /> Create Space
        </button>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <aside className="space-y-4">
          {spaces.map((space) => (
            <button
              key={space.id}
              onClick={() => setSelectedId(space.id)}
              className={`w-full rounded-3xl border p-5 text-left transition hover:border-indigo-500/50 ${
                selected?.id === space.id ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-white/[0.08] bg-[#111827]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black text-white">{space.name}</h2>
                  <p className="mt-1 text-xs text-slate-400">{space.description}</p>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{space.visibility}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[#0B1220] p-2"><p className="text-sm font-black text-white">{space.members.length}</p><p className="text-[10px] text-slate-500">Members</p></div>
                <div className="rounded-xl bg-[#0B1220] p-2"><p className="text-sm font-black text-white">{space.activeAudits}</p><p className="text-[10px] text-slate-500">Audits</p></div>
                <div className="rounded-xl bg-[#0B1220] p-2"><p className="text-xs font-black text-white">{space.lastActivity}</p><p className="text-[10px] text-slate-500">Activity</p></div>
              </div>
            </button>
          ))}
        </aside>

        <main className="lg:col-span-2 rounded-3xl border border-white/[0.08] bg-[#111827] p-6">
          {selected && (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Space</p>
                  <h2 className="mt-1 text-2xl font-black text-white">{selected.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">{selected.description}</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-[#0B1220] px-3 py-2 text-xs font-bold text-slate-300">
                  <Lock size={14} /> {selected.visibility}
                </span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
                {(['Discussions', 'Audits', 'Members'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{tab}</button>
                ))}
              </div>

              <div className="mt-6">
                {activeTab === 'Discussions' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B1220] p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-white"><MessageSquare size={16} className="text-indigo-400" /> Thread: Audit risk review</div>
                      <p className="mt-2 text-sm text-slate-400">Audit ID: <span className="font-mono text-slate-300">{jobId ?? 'demo-thread'}</span></p>
                      <div className="mt-4 space-y-3">
                        <p className="rounded-xl bg-slate-800 p-3 text-sm text-slate-200"><strong>Compliance Lead:</strong> Review EEOC threshold before deciding.</p>
                        <p className="rounded-xl bg-indigo-500/10 p-3 text-sm text-indigo-100"><strong>Auditor:</strong> Proxy detection and simulation should be attached to passport.</p>
                      </div>
                    </div>
                    {jobId ? <AuditComments jobId={jobId} /> : <p className="rounded-2xl border border-slate-800 bg-[#0B1220] p-5 text-sm text-slate-400">Start or open an audit to attach live comments to `audit_id`.</p>}
                  </div>
                )}
                {activeTab === 'Audits' && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B1220] p-4">
                      <p className="font-bold text-white">{currentFile?.name ?? 'Adult Income Demo Audit'}</p>
                      <p className="mt-1 text-xs text-slate-500">Status: Active review · Audit ID {jobId ?? 'demo'}</p>
                    </div>
                  </div>
                )}
                {activeTab === 'Members' && (
                  <div className="space-y-3">
                    {selected.members.map((member) => (
                      <div key={member.name} className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0B1220] p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 font-black text-indigo-300">{member.name[0]}</div>
                          <p className="font-bold text-white">{member.name}</p>
                        </div>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">{member.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/[0.08] bg-[#111827] p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-white">Create Space</h2>
            <div className="mt-5 space-y-4">
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Space Name" className="w-full rounded-xl border border-slate-700 bg-[#0B1220] px-4 py-3 text-white outline-none focus:border-indigo-500" />
              <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description" className="min-h-28 w-full rounded-xl border border-slate-700 bg-[#0B1220] px-4 py-3 text-white outline-none focus:border-indigo-500" />
              <select value={draft.visibility} onChange={(e) => setDraft((d) => ({ ...d, visibility: e.target.value as Space['visibility'] }))} className="w-full rounded-xl border border-slate-700 bg-[#0B1220] px-4 py-3 text-white outline-none focus:border-indigo-500">
                <option>Private</option>
                <option>Team</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 font-bold text-white hover:bg-slate-700">Cancel</button>
              <button onClick={createSpace} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white hover:bg-indigo-500">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

