/**
 * Impact estimates from dataset scale, subgroup cardinality, and disparity gap (fraction).
 *
 * affected = subgroup size (rows in the subgroup scope)
 * improved = affected × disparity_gap
 */

export type ImpactComputation = {
  /** Same as rounded totalRows (for display) */
  datasetSize: number;
  /** Rounded subgroup row count — “affected population” scope */
  affected: number;
  /** Rounded expected benefit if gap were closed by mitigation */
  improved: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * @param totalRows - full dataset rows (display only for dataset size)
 * @param subgroupSize - rows in the protected subgroup
 * @param disparityGap - 0–1 typical (e.g. TPR gap severity); values &gt; 1 treated as ratio /100 for safety
 */
export function computeImpactMetrics(
  totalRows: number,
  subgroupSize: number,
  disparityGap: number,
): ImpactComputation {
  let gap = disparityGap;
  if (gap > 1 && gap <= 100) gap = gap / 100;
  gap = clamp01(gap);

  const datasetSize = Math.max(0, Math.round(totalRows));
  const affected = Math.max(0, Math.round(subgroupSize));
  const improved = Math.max(0, Math.round(affected * gap));

  return { datasetSize, affected, improved };
}
