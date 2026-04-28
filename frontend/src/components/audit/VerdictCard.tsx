import { Gavel, Scale, Shield, Sparkles } from 'lucide-react';

export type VerdictPayload = {
  severity: string;
  legal_exposure: string;
  confidence: number;
  recommendation: string;
};

export type VerdictCardProps =
  | { mode: 'loading' }
  | { mode: 'empty'; message?: string }
  | VerdictPayload;

function severityStyles(sev: string): string {
  const u = sev.toUpperCase();
  if (u === 'CRITICAL') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  if (u === 'HIGH') return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  if (u === 'MEDIUM') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
}

function confidenceBadgeStyles(confidence: number): { tone: 'high' | 'medium'; classes: string } {
  // Confidence score is already derived from dataset size + consistency server-side.
  if (confidence >= 80) {
    return {
      tone: 'high',
      classes: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25',
    };
  }
  return {
    tone: 'medium',
    classes: 'bg-amber-500/12 text-amber-300 border-amber-500/25',
  };
}

export function VerdictCard(props: VerdictCardProps) {
  if ('mode' in props && props.mode === 'loading') {
    return (
      <div
        className="glass-panel rounded-2xl border border-slate-700/50 p-6 md:p-8 animate-pulse"
        aria-busy="true"
        aria-label="Loading verdict"
      >
        <div className="h-5 w-48 bg-slate-700/80 rounded-lg mb-6" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-16 bg-slate-800/90 rounded-xl" />
          <div className="h-16 bg-slate-800/90 rounded-xl" />
          <div className="h-16 bg-slate-800/90 rounded-xl md:col-span-2" />
        </div>
      </div>
    );
  }

  if ('mode' in props && props.mode === 'empty') {
    return (
      <div className="glass-panel rounded-2xl border border-slate-700/40 p-6 md:p-8 bg-slate-900/40">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-600 shrink-0">
            <Shield className="text-slate-500" size={22} />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-1">Fairness verdict</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              {props.message ??
                'No verdict is available yet. Run a new audit while the backend is running, or reconnect to the session that computed results.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { severity, legal_exposure, confidence, recommendation } = props as VerdictPayload;
  const confidencePct = Math.round(Number(confidence) || 0);
  const confidenceBadge = confidenceBadgeStyles(confidencePct);

  return (
    <div className="glass-panel rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-950/40 to-slate-900/50 p-6 md:p-8 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-400/25">
            <Scale className="text-indigo-300" size={22} />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">Fairness verdict</h2>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
              Deterministic assessment
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border ${severityStyles(severity)}`}
        >
          {severity}
        </span>
      </div>

      <dl className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
          <dt className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
            <Gavel size={14} className="text-slate-500" aria-hidden /> Legal exposure
          </dt>
          <dd className="text-white font-bold text-sm leading-snug">{legal_exposure}</dd>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
          <dt className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
            <Sparkles size={14} className="text-indigo-400" aria-hidden /> Confidence
          </dt>
          <dd className="flex items-center gap-2 flex-wrap">
            <span className="text-indigo-200 font-black tabular-nums text-2xl">{confidencePct}%</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${confidenceBadge.classes}`}
              title={
                confidenceBadge.tone === 'high'
                  ? 'High confidence: large and consistent dataset signal.'
                  : 'Medium confidence: dataset signal is usable but less stable.'
              }
            >
              Confidence: {confidencePct}%
            </span>
          </dd>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 md:col-span-2">
          <dt className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Recommendation</dt>
          <dd className="text-slate-200 text-sm leading-relaxed">{recommendation}</dd>
        </div>
      </dl>
    </div>
  );
}
