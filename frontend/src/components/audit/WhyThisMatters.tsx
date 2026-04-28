import { Lightbulb } from 'lucide-react';

/**
 * 5-second plain-language risk callout.
 */
export function WhyThisMatters() {
  return (
    <div className="glass-panel rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/35 to-slate-900/60 p-5 md:p-6 shadow-xl animate-in fade-in duration-500">
      <div className="flex gap-3.5">
        <div className="shrink-0 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
          <Lightbulb className="text-amber-400" size={20} aria-hidden />
        </div>
        <div className="space-y-2 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-400/90">
            Why this matters
          </p>
          <div className="space-y-1 text-slate-100 text-lg leading-snug font-black">
            <p>
              This model rejects female applicants 23% more often.
            </p>
            <p className="text-slate-200 text-base">
              This may violate EEOC guidelines and affect thousands of people.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WhyThisMatters;
