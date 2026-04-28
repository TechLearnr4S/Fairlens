import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  LayoutGrid,
  RefreshCw,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';

const shell =
  'rounded-2xl border border-slate-700/50 bg-slate-900/40 flex flex-col items-center text-center gap-4';
const shellPaddingDefault = 'p-10 md:p-12';
const shellPaddingCompact = 'p-6 md:p-8';

type Base = {
  className?: string;
  /** Tighter padding for nested cards */
  compact?: boolean;
};

export type AuditEmptyStateProps = Base &
  (
    | {
        variant: 'no-audit';
        title?: string;
        description?: string;
        icon?: LucideIcon;
        ctaHref?: string;
        ctaLabel?: string;
        secondaryCta?: { label: string; href: string } | { label: string; onClick: () => void };
      }
    | {
        variant: 'missing-data';
        title: string;
        description: string;
        icon?: LucideIcon;
        cta?:
          | { label: string; to: string }
          | { label: string; href: string }
          | { label: string; onClick: () => void };
      }
    | {
        variant: 'failed-api';
        title?: string;
        description?: string;
        onRetry: () => void;
        retryLabel?: string;
      }
  );

const defaultNoAudit = {
  title: 'No audit loaded',
  description:
    'Upload a dataset and complete a fairness run to unlock this section.',
  ctaHref: '/new-audit',
  ctaLabel: 'Start an audit',
};

const defaultFailedApi = {
  title: 'Something went wrong',
  description: 'We could not load this data. Check that the API is running and try again.',
};

/**
 * Reusable empty state for audit flows: no run yet, missing prerequisites, or API failure.
 * Use `variant="no-audit"` when there is no active job; `missing-data` when prerequisites
 * are not met; `failed-api` with `onRetry` after a failed request.
 */
export function AuditEmptyState(props: AuditEmptyStateProps) {
  const { className = '', compact } = props;
  const pad = compact ? shellPaddingCompact : shellPaddingDefault;

  if (props.variant === 'failed-api') {
    const {
      title = defaultFailedApi.title,
      description = defaultFailedApi.description,
      onRetry,
      retryLabel = 'Try again',
    } = props;
    return (
      <div className={`${shell} ${pad} animate-in fade-in duration-300 ${className}`} role="alert">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <AlertTriangle className="text-rose-400" size={28} aria-hidden />
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
          <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/30 shadow-lg shadow-indigo-500/15 transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <RefreshCw size={16} aria-hidden />
          {retryLabel}
        </button>
      </div>
    );
  }

  if (props.variant === 'missing-data') {
    const { title, description, icon: Icon = LayoutGrid, cta } = props;
    return (
      <div className={`${shell} ${pad} animate-in fade-in duration-300 ${className}`}>
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Icon className="text-amber-400" size={28} aria-hidden />
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
          <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
        </div>
        {cta && <CtaButton cta={cta} />}
      </div>
    );
  }

  const {
    title = defaultNoAudit.title,
    description = defaultNoAudit.description,
    icon: Icon = ClipboardList,
    ctaHref = defaultNoAudit.ctaHref,
    ctaLabel = defaultNoAudit.ctaLabel,
    secondaryCta,
  } = props;

  return (
    <div className={`${shell} ${pad} animate-in fade-in duration-300 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
        <Icon className="text-indigo-400" size={28} aria-hidden />
      </div>
      <div className="space-y-2 max-w-md">
        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to={ctaHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/30 shadow-lg shadow-indigo-500/15 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <UploadCloud size={16} aria-hidden />
          {ctaLabel}
        </Link>
        {secondaryCta && 'href' in secondaryCta ? (
          <Link
            to={secondaryCta.href}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            {secondaryCta.label}
          </Link>
        ) : secondaryCta ? (
          <button
            type="button"
            onClick={secondaryCta.onClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            {secondaryCta.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CtaButton({
  cta,
}: {
  cta:
    | { label: string; to: string }
    | { label: string; href: string }
    | { label: string; onClick: () => void };
}) {
  if ('to' in cta) {
    return (
      <Link
        to={cta.to}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-all"
      >
        {cta.label}
      </Link>
    );
  }
  if ('href' in cta && cta.href.startsWith('#')) {
    return (
      <a
        href={cta.href}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-all"
      >
        {cta.label}
      </a>
    );
  }
  if ('href' in cta) {
    return (
      <a
        href={cta.href}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-all"
      >
        {cta.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={cta.onClick}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-all"
    >
      {cta.label}
    </button>
  );
}
