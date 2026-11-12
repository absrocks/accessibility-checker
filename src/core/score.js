// Severity ranks used everywhere: 4 critical, 3 serious, 2 moderate, 1 minor, 0 unknown.
export const IMPACT_RANK = { minor: 1, moderate: 2, serious: 3, critical: 4 };
export const IMPACT_LABEL = ['Unknown', 'Minor', 'Moderate', 'Serious', 'Critical'];

/**
 * Page score, 0 to 100.
 *
 * Each rule that passed counts 1. Each rule that failed counts against the
 * page by its severity rank (critical 4 ... minor 1, unknown 2). Rules that
 * need manual review and rules that did not apply are left out.
 *
 *   score = 100 * passed / (passed + sum of failed weights)
 *
 * A page where nothing could be evaluated scores null, not 100.
 */
export function pageScore(rules) {
  let passed = 0;
  let penalty = 0;
  for (const r of rules) {
    if (r.outcome === 'pass') passed += 1;
    else if (r.outcome === 'fail') penalty += r.impactRank || 2;
  }
  if (passed + penalty === 0) return null;
  return Math.round((100 * passed) / (passed + penalty));
}

/** Scan score: the mean of its page scores, ignoring pages with no score. */
export function scanScore(pageScores) {
  const vals = pageScores.filter((s) => typeof s === 'number');
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
