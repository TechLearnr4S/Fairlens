import { Link, Outlet, useNavigate } from 'react-router-dom';
import { Activity, ShieldCheck, UploadCloud, Users, FileLock, LogOut } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/landing');
  };

  return (
    <div className="min-h-screen flex bg-dark-900 text-slate-200">
      <aside className="w-64 border-r border-slate-700/50 bg-dark-800/30 flex flex-col">
        <div className="p-6 pb-2 border-b border-transparent">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold font-sans tracking-tight">FairLens</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 py-4">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-colors">
            <Activity size={18} />
            Dashboard
          </Link>
          <Link to="/new-audit" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-colors">
            <UploadCloud size={18} />
            New Audit
          </Link>
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 cursor-not-allowed">
            <Users size={18} />
            Teams (Soon)
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 cursor-not-allowed">
            <FileLock size={18} />
            Passports (Soon)
          </a>
        </nav>

        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-lg bg-dark-800 border border-slate-700/50">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold uppercase text-sm">
              {user?.name?.[0] || 'A'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate">{user?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>
      
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
