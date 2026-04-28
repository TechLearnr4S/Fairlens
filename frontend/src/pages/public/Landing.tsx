import { Link } from 'react-router-dom';
import { Activity, ShieldCheck, FileLock, MoveRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export default function Landing() {
  return (
    <div className="min-h-screen bg-dark-900 text-slate-200 flex flex-col">
      <header className="border-b border-slate-700/50 bg-dark-800/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold font-sans tracking-tight text-white">FairLens</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Log in
            </Link>
            <Link to="/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-24 px-6 max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 text-white max-w-4xl mx-auto leading-tight">
            Uncover Bias. <br className="hidden md:block"/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400">
              Ensure Algorithmic Fairness.
            </span>
          </h1>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            The enterprise governance platform for auditing machine learning models, detecting hidden proxies, and generating tamper-evident compliance passports.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/signup">
              <Button size="lg" className="gap-2">
                Start Auditing <MoveRight size={18} />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline">
                Sign In
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6 bg-dark-800/30 border-t border-slate-800">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white mb-4">Enterprise Grade Diagnostics</h2>
              <p className="text-slate-400 max-w-2xl mx-auto">Designed for compliance teams and data scientists to rigorously evaluate models before production.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="glass-panel p-8">
                <div className="w-12 h-12 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400 mb-6">
                  <Activity size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-white">Disparity Detection</h3>
                <p className="text-slate-400 leading-relaxed">Instantly visualize demographic parity differences and algorithmic starvation across sensitive subgroups.</p>
              </div>

              <div className="glass-panel p-8">
                <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-white">Proxy Bias Hunter</h3>
                <p className="text-slate-400 leading-relaxed">Automatically scan your dataset for seemingly innocuous variables that act as hidden proxies for protected traits.</p>
              </div>

              <div className="glass-panel p-8">
                <div className="w-12 h-12 rounded-lg bg-teal-500/20 flex items-center justify-center text-teal-400 mb-6">
                  <FileLock size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-white">Fairness Passports</h3>
                <p className="text-slate-400 leading-relaxed">Export tamper-evident PDF/Markdown audit receipts with cryptographic SHA-256 signatures for compliance logs.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-8 text-center text-slate-500 text-sm">
        <p>© {new Date().getFullYear()} FairLens Studio. All rights reserved.</p>
      </footer>
    </div>
  );
}
