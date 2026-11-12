// What a scan is, independent of what runs it. The server drives pages with
// Playwright (src/scanner.js); the published site drives them in iframes
// (public/browser-scanner.js). Both use everything in this file.
import { CUSTOM_RULES, shapeCustomResults } from './custom-rules.js';
import { pageScore } from './score.js';
import { isCrawlable, normalizeUrl } from './urls.js';
import { STANDARDS, isScored } from './wcag.js';

export const MAX_HTML = 2_000;

export const DEVICES = {
  desktop: { viewport: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

// What a scan can be run at. "both" loads every page twice and merges the
// results: responsive sites hide different elements at each width, and rules
// that skip hidden elements only see what that width exposes.
export const VIEWPORTS = {
  both: { label: 'Desktop and mobile', devices: ['desktop', 'mobile'] },
  desktop: { label: 'Desktop (1920 x 1080)', devices: ['desktop'] },
  mobile: { label: 'Mobile (390 x 844)', devices: ['mobile'] },
};

/** Shown on every scan so results can be traced to what produced them. */
export const engineLabel = (axeVersion, note = '') =>
  `axe-core ${axeVersion} + ${CUSTOM_RULES.length} custom rules${note ? `, ${note}` : ''}`;

/** axe-core tags to run for a scan's standard and options. */
export function tagsFor(scan) {
  const standard = STANDARDS[scan.standard] || STANDARDS.wcag22aa;
  return scan.best_practices ? [...standard.tags, 'best-practice'] : standard.tags;
}

export const devicesFor = (scan) => (VIEWPORTS[scan.viewport] || VIEWPORTS.desktop).devices;

/**
 * Options passed to axe.run. Frames are skipped: axe would have to be injected
 * into each one. heading-order is off because the custom rule
 * heading-level-skipped reports the same headings and more.
 */
export const axeRunOptions = (tags) => ({
  runOnly: { type: 'tag', values: tags },
  rules: { 'heading-order': { enabled: false } },
  iframes: false,
  elementRef: false,
});

/**
 * Runs inside the page, after axe-core is loaded there. Returns a trimmed,
 * serializable copy of axe's results. Self-contained: it is sent to the page
 * as source text.
 */
/* c8 ignore start */
export async function runAxeInPage({ runOptions, maxHtml }) {
  const rank = { minor: 1, moderate: 2, serious: 3, critical: 4 };
  const order = { inapplicable: 0, pass: 1, review: 2, fail: 3 };
  const results = await window.axe.run(document, runOptions);
  const selectorOf = (target) =>
    (target || []).map((part) => (Array.isArray(part) ? part.join(' >>> ') : part)).join(' | ');
  const rules = new Map();
  const meta = new Map();
  const findings = [];

  const note = (rule, outcome) => {
    meta.set(rule.id, {
      id: rule.id,
      help: rule.help,
      description: rule.description,
      helpUrl: rule.helpUrl,
      tags: rule.tags,
    });
    let row = rules.get(rule.id);
    if (!row) {
      row = { id: rule.id, outcome, impactRank: 0, nodes: 0, passed: 0, failed: 0 };
      rules.set(rule.id, row);
    }
    // Elements that passed and failed this rule, for the score.
    if (outcome === 'pass') row.passed += rule.nodes.length;
    if (outcome === 'fail') row.failed += rule.nodes.length;
    if (order[outcome] >= order[row.outcome]) {
      row.outcome = outcome;
      row.impactRank = rank[rule.impact] || 0;
      row.nodes = rule.nodes.length;
    }
  };
  const collect = (rule, kind) => {
    for (const node of rule.nodes) {
      const checks = [...(node.any || []), ...(node.all || []), ...(node.none || [])];
      findings.push({
        ruleId: rule.id,
        kind,
        impactRank: rank[node.impact] || rank[rule.impact] || 0,
        selector: selectorOf(node.target),
        html: String(node.html || '').slice(0, maxHtml),
        summary: node.failureSummary || checks.map((c) => c.message).filter(Boolean).join('\n'),
      });
    }
  };

  for (const rule of results.inapplicable) note(rule, 'inapplicable');
  for (const rule of results.passes) note(rule, 'pass');
  for (const rule of results.incomplete) {
    note(rule, 'review');
    collect(rule, 'review');
  }
  for (const rule of results.violations) {
    note(rule, 'fail');
    collect(rule, 'fail');
  }

  return {
    title: document.title,
    rules: [...rules.values()],
    meta: [...meta.values()],
    findings,
    links: Array.from(document.links, (a) => a.href),
  };
}
/* c8 ignore stop */

/**
 * A page checked without its styles gives wrong results (everything visible,
 * tiny targets, no colours), so scanners retry and then refuse instead of
 * reporting them. A failed stylesheet cannot be seen afterwards, so the
 * first function must run before the page's links load: it records each
 * stylesheet that fails. The second returns what was recorded. Both run
 * inside the page and are self-contained.
 */
/* c8 ignore start */
export function trackStylesheetErrorsInPage() {
  window.__checkerFailedStyles = [];
  document.addEventListener('error', (event) => {
    const el = event.target;
    if (el && el.tagName === 'LINK' && /stylesheet/i.test(el.rel || '') && !/alternate/i.test(el.rel || '')) {
      window.__checkerFailedStyles.push(el.href);
    }
  }, true); // load errors do not bubble; capture them on the way down
}

export function unloadedStylesheetsInPage() {
  // In a scan frame the document has no address of its own; its base is the page it came from.
  const pageOrigin = /^https?:$/.test(location.protocol) ? location.origin : new URL(document.baseURI).origin;
  const own = [];
  const thirdParty = [];
  for (const href of new Set(window.__checkerFailedStyles || [])) {
    let origin = null;
    try {
      origin = new URL(href).origin;
    } catch { /* treated as third-party */ }
    (origin === pageOrigin ? own : thirdParty).push(href);
  }
  // `own` are the site's stylesheets: without them the page is unstyled.
  // `thirdParty` are from elsewhere, typically web fonts: the layout survives.
  return { own, thirdParty };
}
/* c8 ignore stop */

/** A note kept with a page that was scanned without a third-party stylesheet. */
export function thirdPartyStylesNote(hrefs) {
  if (!hrefs?.length) return null;
  const hosts = [...new Set(hrefs.map((h) => { try { return new URL(h).host; } catch { return h; } }))];
  return `Scanned without ${hrefs.length === 1 ? 'a stylesheet' : `${hrefs.length} stylesheets`} from ${hosts.join(', ')}, which did not load. ` +
    'Fonts or styling from there were not applied, which can change contrast and size results slightly.';
}

/** The message for a page whose own styles could not be loaded. */
export const stylesMissingMessage = (hrefs) =>
  `The page's styles did not load (${hrefs[0]}${hrefs.length > 1 ? ` and ${hrefs.length - 1} more` : ''}), so the results would be wrong. Check your connection and run the scan again.`;

/** Join axe-core's results for one page view with the custom rules' results. */
export function combineResults(axeResult, customRaw, url, note = null) {
  const custom = shapeCustomResults(customRaw);
  const meta = [...axeResult.meta, ...custom.meta];
  const rules = markScored([...axeResult.rules, ...custom.rules], meta);
  return {
    ...axeResult,
    rules,
    meta,
    findings: [...axeResult.findings, ...custom.findings],
    url,
    note,
    score: pageScore(rules),
  };
}

/** Best-practice rules are reported but do not count towards the score. */
export function markScored(rules, meta) {
  const tags = new Map(meta.map((m) => [m.id, m.tags]));
  return rules.map((r) => ({ ...r, scored: isScored(tags.get(r.id)) }));
}

const OUTCOME_ORDER = { inapplicable: 0, pass: 1, review: 2, fail: 3 };

/**
 * Combine the results of scanning one page at several viewports. A rule takes
 * its worst outcome; an element flagged at more than one viewport is one
 * finding, and its summary says where it was seen.
 */
export function mergeViewportResults(results, names) {
  if (results.length === 1) return results[0];
  const rules = new Map();
  const meta = new Map();
  const findings = new Map();
  results.forEach((result, i) => {
    for (const m of result.meta) meta.set(m.id, m);
    for (const r of result.rules) {
      const prev = rules.get(r.id);
      if (!prev) rules.set(r.id, { ...r });
      else {
        if (OUTCOME_ORDER[r.outcome] > OUTCOME_ORDER[prev.outcome]) prev.outcome = r.outcome;
        prev.impactRank = Math.max(prev.impactRank || 0, r.impactRank || 0);
        prev.nodes = Math.max(prev.nodes || 0, r.nodes || 0);
        prev.passed = Math.max(prev.passed || 0, r.passed || 0);
      }
    }
    for (const f of result.findings) {
      const key = `${f.ruleId}\n${f.selector}`;
      const prev = findings.get(key);
      if (!prev) findings.set(key, { ...f, seenAt: [names[i]] });
      else {
        prev.seenAt.push(names[i]);
        if (f.kind === 'fail') prev.kind = 'fail';
        prev.impactRank = Math.max(prev.impactRank || 0, f.impactRank || 0);
      }
    }
  });
  const merged = [...findings.values()].map(({ seenAt, ...f }) => ({
    ...f,
    summary: [f.summary, `Seen at: ${seenAt.join(', ')}`].filter(Boolean).join('\n'),
  }));
  // An element failing at two widths is one failure, so count the merged findings.
  const failedByRule = new Map();
  for (const f of merged) if (f.kind === 'fail') failedByRule.set(f.ruleId, (failedByRule.get(f.ruleId) || 0) + 1);
  const allRules = [...rules.values()].map((r) => ({ ...r, failed: failedByRule.get(r.id) || 0 }));
  return {
    ...results[0],
    rules: allRules,
    meta: [...meta.values()],
    findings: merged,
    links: [...new Set(results.flatMap((r) => r.links || []))],
    note: [...new Set(results.map((r) => r.note).filter(Boolean))].join(' ') || null,
    score: pageScore(allRules),
  };
}

/**
 * Scan the pages listed in `scan.urls`, then follow same-origin links
 * breadth-first until `scan.max_pages` pages have been attempted.
 * `scanUrl(url)` evaluates one page at every viewport of the scan and returns
 * the merged result, including `links`. `onPage` receives each result, or
 * `{ url, error }` for a page that could not be scanned.
 */
export async function crawl(scan, scanUrl, onPage) {
  // Listed pages come first; links are followed only on the first page's site.
  const listed = scan.urls ? JSON.parse(scan.urls) : [scan.url];
  const queue = [...new Set(listed.map(normalizeUrl).filter(Boolean))];
  const origin = new URL(queue[0]).origin;
  const seen = new Set(queue);
  let attempted = 0;

  while (queue.length && attempted < scan.max_pages) {
    const url = queue.shift();
    attempted += 1;
    try {
      const result = await scanUrl(url);
      seen.add(normalizeUrl(result.url));
      for (const href of result.links || []) {
        const next = normalizeUrl(href);
        if (next && !seen.has(next) && isCrawlable(next, origin)) {
          seen.add(next);
          queue.push(next);
        }
      }
      const { links: _links, ...stored } = result;
      await onPage(stored);
    } catch (e) {
      await onPage({ url, error: String(e?.message || e).split('\n')[0] });
    }
  }
}
