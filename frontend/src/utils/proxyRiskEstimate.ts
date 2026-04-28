/**
 * Heuristic proxy-risk estimate from column name alone (no statistical MI).
 */

export type ProxyRiskEstimate = {
  column: string;
  risk_score: number;
  label: string;
};

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Location / postal patterns → high surrogate proxy risk */
const HIGH_TOKENS = new Set([
  'zip',
  'zipcode',
  'zipcodes',
  'postal',
  'postcode',
  'postcodes',
  'address',
  'location',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'city',
  'borough',
  'county',
  'state',
  'province',
  'country',
  'region',
  'neighborhood',
  'metro',
  'census',
  'tract',
  'fips',
  'timezone',
  'utc',
  'coordinate',
  'coordinates',
  'coords',
  'geo',
  'mailing',
]);

/** Personal name fields → medium */
const MEDIUM_TOKENS = new Set([
  'name',
  'firstname',
  'lastname',
  'fname',
  'lname',
  'surname',
  'fullname',
  'given',
  'maiden',
  'nickname',
  'middlename',
  'username',
]);

/** Stable numeric-ish identifiers → low */
const LOW_ID_TOKENS = new Set([
  'id',
  'uuid',
  'guid',
  'pk',
  'serial',
  'seq',
  'index',
  'rowid',
  'rownum',
]);

function isHighRiskName(name: string): boolean {
  return tokens(name).some((x) => HIGH_TOKENS.has(x));
}

function isMediumRiskName(name: string): boolean {
  return tokens(name).some((x) => MEDIUM_TOKENS.has(x));
}

function isLowIdName(name: string): boolean {
  return tokens(name).some((x) => LOW_ID_TOKENS.has(x));
}

/**
 * Highest severity wins when several patterns overlap.
 *
 * @example estimateProxyRiskScore("zip_code")
 * → { column: "zip_code", risk_score: 0.85, label: "High Proxy Risk" }
 */
export function estimateProxyRiskScore(columnName: string): ProxyRiskEstimate {
  const normalized = columnName.trim();

  let tier: 'high' | 'medium' | 'low';
  if (isHighRiskName(normalized)) {
    tier = 'high';
  } else if (isMediumRiskName(normalized)) {
    tier = 'medium';
  } else if (isLowIdName(normalized)) {
    tier = 'low';
  } else {
    tier = 'low';
  }

  const table = {
    high: { risk_score: 0.85, label: 'High Proxy Risk' as const },
    medium: { risk_score: 0.52, label: 'Medium Proxy Risk' as const },
    low: { risk_score: 0.22, label: 'Low Proxy Risk' as const },
  };

  const { risk_score, label } = table[tier];

  return {
    column: normalized,
    risk_score,
    label,
  };
}
