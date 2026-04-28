/** Proxy-risks API: unwrap heatmap-shaped data from correlation_matrix payloads. */

function isLegacyHeatmapCell(v: unknown): boolean {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    'correlation_score' in (v as object)
  );
}

function looksLikeLegacyProtectedFeatureMap(raw: Record<string, unknown>): boolean {
  const keys = Object.keys(raw);
  if (keys.length === 0) return false;
  const first = raw[keys[0]];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return false;
  const innerKeys = Object.keys(first as object);
  if (innerKeys.length === 0) return false;
  return isLegacyHeatmapCell((first as Record<string, unknown>)[innerKeys[0]]);
}

/**
 * Returns nested map: protected_attribute -> feature -> score row (heatmap / network graphs).
 *
 * Supports:
 * - `{ associations: { race: { age: { correlation_score, ... }}}}`
 * - legacy flat `{ race: { age: { correlation_score, ... }}}` (backward compatible)
 */
export function unwrapProxyCorrelationHeatmap(
  raw: unknown,
): Record<string, Record<string, unknown>> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (typeof o.associations === 'object' && o.associations !== null && !Array.isArray(o.associations)) {
    const a = o.associations as Record<string, unknown>;
    return looksLikeLegacyProtectedFeatureMap(a) ? (a as Record<string, Record<string, unknown>>) : null;
  }

  if (looksLikeLegacyProtectedFeatureMap(o)) {
    return o as Record<string, Record<string, unknown>>;
  }

  return null;
}
