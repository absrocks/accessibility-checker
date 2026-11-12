// Severity ranks used everywhere: 4 critical, 3 serious, 2 moderate, 1 minor, 0 unknown.
export const IMPACT_RANK = { minor: 1, moderate: 2, serious: 3, critical: 4 };
export const IMPACT_LABEL = ['Unknown', 'Minor', 'Moderate', 'Serious', 'Critical'];

/**
 * The most a page can score. Automated rules cover only part of WCAG, so a
 * page that passes all of them is not shown as 100.
 */
export const MAX_SCORE = 85;

/**
 * Points a failing rule costs, by severity rank. Minor is the only cheaper
 * one. See "How the score works" in the README for where the numbers come from.
 */
export const RULE_COST = [0.93, 0.65, 0.93, 0.93, 0.93];

/**
 * Page score, 0 to 85.
 *
 *   score = 85 - 0.93 for each failing rule (0.65 if its severity is minor),
 *           rounded down
 *
 * What counts is whether a rule fails on the page, not how many elements
 * fail it: 28 elements failing one rule cost the same as one. Rules that
 * need review, did not apply, or are only best practices cost nothing.
 *
 * This is calibrated to Level Access's Access Engine, whose scores for the
 * same page it reproduces when both report the same failing rules.
 *
 * `rules` are rows with { outcome, impactRank, scored }. A page where no
 * scored rule was evaluated returns null.
 */
export function pageScore(rules) {
  let evaluated = 0;
  let cost = 0;
  for (const r of rules) {
    if (r.scored === false) continue;
    if (r.outcome === 'pass') evaluated += 1;
    else if (r.outcome === 'fail') {
      evaluated += 1;
      cost += RULE_COST[r.impactRank] ?? RULE_COST[0];
    }
  }
  return evaluated ? Math.max(0, Math.floor(MAX_SCORE - cost + 1e-9)) : null;
}

/** Scan score: the mean of its page scores, ignoring pages with no score. */
export function scanScore(pageScores) {
  const vals = pageScores.filter((s) => typeof s === 'number');
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
