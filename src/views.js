// Shapes sent to the interface. Shared by the live API (server.js) and the
// static snapshot (export.js) so both show the same thing.
import { ENGINE, VIEWPORTS } from './scanner.js';
import { IMPACT_LABEL } from './score.js';
import { STANDARDS, criteriaFromTags, levelOfRule } from './wcag.js';

export const MAX_PAGES = 50;

export function describeRule(r) {
  return {
    ...r,
    criteria: criteriaFromTags(r.tags),
    level: levelOfRule(r.tags),
    severity: IMPACT_LABEL[r.impact_rank],
    custom: r.tags.includes('custom'),
  };
}

export function describeScan(s) {
  return {
    ...s,
    best_practices: Boolean(s.best_practices),
    standard_label: STANDARDS[s.standard]?.label || s.standard,
    viewport_label: VIEWPORTS[s.viewport]?.label || s.viewport,
  };
}

export function configView() {
  return {
    engine: ENGINE,
    maxPages: MAX_PAGES,
    standards: Object.entries(STANDARDS).map(([id, s]) => ({ id, label: s.label })),
    viewports: Object.entries(VIEWPORTS).map(([id, v]) => ({ id, label: v.label })),
  };
}

/** Everything the scan results page shows. */
export function scanDetail(store, scan) {
  const rules = store.scanRules(scan.id).map(describeRule);
  const evaluated = rules.filter((r) => r.outcome !== 'inapplicable');
  const levels = ['A', 'AA', 'Best practice']
    .map((level) => {
      const inLevel = evaluated.filter((r) => r.level === level);
      return {
        level,
        rules_evaluated: inLevel.length,
        findings: inLevel.filter((r) => r.outcome === 'fail').reduce((n, r) => n + r.open, 0),
      };
    })
    .filter((l) => l.rules_evaluated);
  return {
    scan: describeScan(scan),
    pages: store.scanPages(scan.id),
    severity: store.scanSeverity(scan.id),
    levels,
    counts: {
      fail: rules.filter((r) => r.outcome === 'fail').length,
      review: rules.filter((r) => r.outcome === 'review').length,
      pass: rules.filter((r) => r.outcome === 'pass').length,
      inapplicable: rules.filter((r) => r.outcome === 'inapplicable').length,
    },
    rules: evaluated.sort((a, b) => b.impact_rank - a.impact_rank || b.open - a.open || a.rule_id.localeCompare(b.rule_id)),
  };
}

/** One finding with its rule, criteria and history, or null. */
export function findingDetail(store, id) {
  const f = store.getFinding(id);
  if (!f) return null;
  const tags = JSON.parse(f.rule_tags || '[]');
  delete f.rule_tags;
  return {
    ...f,
    severity: IMPACT_LABEL[f.impact_rank],
    criteria: criteriaFromTags(tags),
    level: levelOfRule(tags),
    custom: tags.includes('custom'),
  };
}
