import { computeImpactMetrics } from './impact';

export type AuditSummaryPayload = {
  group: string;
  impacted_group: string;
  disparity: number;
  disparity_gap: number;
  law: string;
  total_rows: number;
  affected: number;
  affected_count: number;
  improved_count: number;
};

function capitalizeWord(s: string): string {
  const t = s.trim();
  if (!t) return s;
  return t.slice(0, 1).toUpperCase() + t.slice(1).toLowerCase();
}

function pickAttribute(disparities: Record<string, unknown>): string | null {
  const keys = Object.keys(disparities || {});
  if (!keys.length) return null;
  if (keys.includes('sex')) return 'sex';
  return keys.sort()[0];
}

export function buildAuditSummary(
  disparities: Record<string, unknown> | null | undefined,
): AuditSummaryPayload | null {
  if (!disparities || typeof disparities !== 'object') return null;

  const attr = pickAttribute(disparities);
  if (!attr) return null;

  const block = disparities[attr] as Record<string, unknown> | undefined;
  const subgroups = block?.subgroups as
    | Array<{ subgroup?: string; selection_rate?: number; count?: number }>
    | undefined;
  if (!subgroups?.length) return null;

  let worstIdx = 0;
  let bestIdx = 0;
  let minRate = Number.POSITIVE_INFINITY;
  let maxRate = 0;

  subgroups.forEach((row, i) => {
    const r = Number(row.selection_rate);
    if (!Number.isFinite(r)) return;
    if (r <= minRate) {
      minRate = r;
      worstIdx = i;
    }
    if (r >= maxRate) {
      maxRate = r;
      bestIdx = i;
    }
  });

  if (!Number.isFinite(minRate)) return null;

  const worstRow = subgroups[worstIdx];
  const bestRow = subgroups[bestIdx];
  const subgroupLabel = String(worstRow?.subgroup ?? 'Unknown').trim();
  const impacted_group = `${capitalizeWord(subgroupLabel)} applicants`;

  const selBest = Number(bestRow?.selection_rate);
  const disparity =
    selBest > 0 ? Math.min(1, Number(worstRow?.selection_rate ?? 0) / selBest) : 0;

  const disparity_gap = Math.max(0, Number(block?.disparity_score) || 0);
  const total_rows = subgroups.reduce(
    (sum, row) => sum + (typeof row?.count === 'number' && Number.isFinite(row.count) ? row.count : 0),
    0,
  );
  const rawCount = worstRow?.count;
  const subgroupSize =
    typeof rawCount === 'number' && Number.isFinite(rawCount) ? Math.round(rawCount) : 0;
  const impact = computeImpactMetrics(total_rows, subgroupSize, disparity_gap);

  return {
    group: impacted_group,
    impacted_group,
    disparity: Math.round(disparity * 100) / 100,
    disparity_gap: Math.round(disparity_gap * 10000) / 10000,
    law: 'EEOC 80% Rule',
    total_rows: impact.datasetSize,
    affected: impact.affected,
    affected_count: impact.affected,
    improved_count: impact.improved,
  };
}
