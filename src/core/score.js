// Severity ranks used everywhere: 4 critical, 3 serious, 2 moderate, 1 minor, 0 unknown.
export const IMPACT_RANK = { minor: 1, moderate: 2, serious: 3, critical: 4 };
export const IMPACT_LABEL = ['Unknown', 'Minor', 'Moderate', 'Serious', 'Critical'];

/** What a failing rule weighs, by severity rank. Unknown severity counts as moderate. */
export const SEVERITY_WEIGHT = [2, 1, 2, 3, 4];
/** A failing rule loses at least this share of its weight, however few elements fail. */
export const FAIL_FLOOR = 0.5;

/**
 * Page score, 0 to 100: a weighted average over the rules that were checked.
 *
 *   A rule that passed            weighs 1 and earns 1.
 *   A rule that failed            weighs its severity (critical 4, serious 3,
 *                                 moderate 2, minor 1) and earns
 *                                 weight x 0.5 x (share of checked elements that passed).
 *   A rule that needs review,     is left out.
 *   did not apply, or is only
 *   a best practice
 *
 *   score = 100 x earned / total weight
 *
 * So a failing rule always costs at least half its weight, and costs all of
 * it when every element it checked fails. More failing elements, or a more
 * severe rule, lower the score; fixing some of them raises it.
 *
 * `rules` are rows with { outcome, impactRank, passed, failed, scored }.
 * A page where nothing could be scored returns null, not 100.
 */
export function pageScore(rules) {
  let total = 0;
  let earned = 0;
  for (const r of rules) {
    if (r.scored === false) continue;
    if (r.outcome === 'pass') {
      total += 1;
      earned += 1;
    } else if (r.outcome === 'fail') {
      const weight = SEVERITY_WEIGHT[r.impactRank] ?? SEVERITY_WEIGHT[0];
      const checked = (r.passed || 0) + (r.failed || 0);
      const passShare = checked ? (r.passed || 0) / checked : 0;
      total += weight;
      earned += weight * (1 - FAIL_FLOOR) * passShare;
    }
  }
  return total ? Math.round((100 * earned) / total) : null;
}

/** Scan score: the mean of its page scores, ignoring pages with no score. */
export function scanScore(pageScores) {
  const vals = pageScores.filter((s) => typeof s === 'number');
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
