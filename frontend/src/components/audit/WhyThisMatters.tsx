import { Lightbulb } from 'lucide-react';

/**
 * 5-second plain-language risk callout.
 */
export function WhyThisMatters({
  group = 'a protected group',
  law = 'applicable fairness rules',
  affectedCount,
}: {
  group?: string;
  law?: string;
  affectedCount?: number | string;
}) {
  const affected = affectedCount != null
    ? `${typeof affectedCount === 'number' ? affectedCount.toLocaleString() : affectedCount} people may be affected.`
    : 'Real people can lose access to jobs, credit, or services.';

  return (
    <div className="rounded-3xl border border-[#F59E0B]/25 bg-[#F59E0B]/10 p-5 md:p-6 shadow-xl animate-in fade-in duration-500">
      <div className="flex gap-3.5">
        <div className="shrink-0 p-3 rounded-xl bg-[#0B1220] border border-white/[0.08]">
          <Lightbulb className="text-[#F59E0B]" size={20} aria-hidden />
        </div>
        <div className="space-y-2 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#F59E0B]">
            Why this matters
          </p>
          <div className="space-y-1 text-slate-100 text-lg leading-snug font-black">
            <p>
              Bias against {group} can quietly change who gets selected.
            </p>
            <p className="text-slate-200 text-base">
              {affected} This may create exposure under {law}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WhyThisMatters;
