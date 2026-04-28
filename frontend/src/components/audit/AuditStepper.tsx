import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuditStore } from '../../store/auditStore';
import { useAuditProgressStore, type AuditProgressStep } from '../../store/auditProgressStore';
import { Check, ArrowRight, Eye, ShieldAlert } from 'lucide-react';

export const AuditStepper: React.FC = () => {
  const {
    jobId,
    disparities,
    simulation,
    auditSummary,
    protectedAttributes,
  } = useAuditStore();
  const { currentStep, status, advanceTo } = useAuditProgressStore();
  const navigate = useNavigate();

  const steps: { id: AuditProgressStep; label: string; desc: string; to: string }[] = [
    { id: 1, label: 'Upload', desc: 'Dataset intake', to: '/new-audit' },
    { id: 2, label: 'Analyze', desc: 'Configure and run', to: '/new-audit' },
    { id: 3, label: 'Detect', desc: 'Bias discovered', to: '/' },
    { id: 4, label: 'Simulate', desc: 'Mitigation sandbox', to: '/sandbox' },
    { id: 5, label: 'Decide', desc: 'Governance action', to: '/' },
  ];

  const disparityEntries = disparities && typeof disparities === 'object'
    ? Object.entries(disparities as Record<string, any>)
    : [];
  const worst = [...disparityEntries].sort(
    ([, a], [, b]) => Number(b?.disparity_score ?? 0) - Number(a?.disparity_score ?? 0),
  )[0];
  const worstAttr = auditSummary?.group ?? auditSummary?.impacted_group ?? worst?.[0] ?? protectedAttributes[0];
  const maxDisparity = Number(worst?.[1]?.disparity_score ?? auditSummary?.disparity ?? 0);
  const highRisk = !!disparities && maxDisparity > 0.2;

  const formatAttr = (value?: string) =>
    value ? value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Protected Group';

  const goTo = (to: string, step?: AuditProgressStep) => {
    if (step) advanceTo(step, jobId);
    navigate(to);
  };

  const cta = !jobId
    ? {
        tone: 'neutral',
        title: 'START WITH A DATASET',
        message: 'Upload a CSV to begin the audit story.',
        primary: 'Upload CSV',
        primaryTo: '/new-audit',
        primaryStep: 1 as AuditProgressStep,
        secondary: 'View Demo',
        secondaryTo: '/new-audit?demo=adult-income&guided=1',
      }
    : !disparities
      ? {
          tone: 'neutral',
          title: 'ANALYSIS READY',
          message: 'Configure attributes and run the fairness scan.',
          primary: 'Run Analysis',
          primaryTo: '/new-audit',
          primaryStep: 2 as AuditProgressStep,
          secondary: 'Dashboard',
          secondaryTo: '/',
        }
      : simulation
        ? {
            tone: 'success',
            title: 'DECISION READY',
            message: 'Mitigation results are available. Review the final governance position.',
            primary: 'View Decision',
            primaryTo: '/',
            primaryStep: 5 as AuditProgressStep,
            secondary: 'Open Sandbox',
            secondaryTo: '/sandbox',
          }
        : highRisk
          ? {
              tone: 'danger',
              title: 'HIGH RISK DETECTED',
              message: `Bias detected in hiring decisions (${formatAttr(worstAttr)}).`,
              primary: 'Run Simulation',
              primaryTo: '/sandbox',
              primaryStep: 4 as AuditProgressStep,
              secondary: 'View Details',
              secondaryTo: '/',
            }
          : {
              tone: 'neutral',
              title: 'DETECTION COMPLETE',
              message: 'Review findings, proxy risks, and the regulatory passport.',
              primary: 'View Details',
              primaryTo: '/',
              primaryStep: 3 as AuditProgressStep,
              secondary: 'Open Sandbox',
              secondaryTo: '/sandbox',
            };

  const toneClasses = {
    danger: 'border-[#EF4444]/35 bg-[#EF4444]/10',
    success: 'border-[#10B981]/35 bg-[#10B981]/10',
    neutral: 'border-[#6366F1]/30 bg-[#6366F1]/10',
  }[cta.tone];

  const titleClasses = {
    danger: 'text-[#EF4444]',
    success: 'text-[#10B981]',
    neutral: 'text-[#8B5CF6]',
  }[cta.tone];

  return (
    <div className="sticky top-0 z-40 mb-10 space-y-4 rounded-b-3xl bg-[#0B1220]/92 pb-4 pt-2 backdrop-blur-xl">
      <div className="rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4">
        <div className="flex items-center justify-between gap-2">
          {steps.map((step, index) => {
            const complete = step.id < currentStep;
            const active = step.id === currentStep;
            return (
              <div key={step.id} className="contents">
                <button
                  type="button"
                  onClick={() => goTo(step.to, step.id)}
                  className="group flex min-w-0 flex-col items-center gap-2 text-center"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black transition-colors ${
                      complete
                        ? 'border-[#10B981] bg-[#10B981] text-white'
                        : active
                          ? 'border-[#6366F1] bg-[#6366F1] text-white'
                          : 'border-white/[0.08] bg-[#0B1220] text-[#9CA3AF]'
                    }`}
                  >
                    {complete ? <Check size={16} /> : step.id}
                  </span>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-[#9CA3AF]'}`}>
                    {step.label}
                  </span>
                  <span className="hidden text-[10px] text-[#9CA3AF] md:block">{step.desc}</span>
                </button>
                {index < steps.length - 1 && (
                  <div className="hidden h-px flex-1 bg-white/[0.08] md:block">
                    <div
                      className="h-px bg-[#6366F1] transition-all"
                      style={{ width: step.id < currentStep ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`flex flex-col gap-4 rounded-2xl border px-5 py-4 shadow-2xl shadow-black/20 md:flex-row md:items-center md:justify-between ${toneClasses}`}>
        <div className="flex items-start gap-4">
          <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#111827] ${titleClasses}`}>
            <ShieldAlert size={20} />
          </div>
          <div className="space-y-0.5">
            <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${titleClasses}`}>{cta.title}</p>
            <p className="text-sm font-semibold text-white">{cta.message}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9CA3AF]">Status: {status}</p>
            {highRisk && !simulation && (
              <p className="text-xs text-[#9CA3AF]">
                Disparate Impact: {(Number(auditSummary?.disparity ?? 1)).toFixed(2)} (Below 0.80 threshold)
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => goTo(cta.primaryTo, cta.primaryStep)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#6366F1] px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-[#6366F1]/20 transition hover:bg-[#8B5CF6]"
          >
            {cta.primary}
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => navigate(cta.secondaryTo)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#111827] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#E5E7EB] transition hover:bg-white/[0.06]"
          >
            <Eye size={14} />
            {cta.secondary}
          </button>
        </div>
      </div>
    </div>
  );
};
