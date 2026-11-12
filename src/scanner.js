import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { CUSTOM_RULES, runCustomRulesInPage, shapeCustomResults } from './custom-rules.js';
import { pageScore } from './score.js';
import { STANDARDS } from './wcag.js';
import { isCrawlable, normalizeUrl } from './urls.js';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
export const AXE_VERSION = require('axe-core/package.json').version;
/** Shown on every scan so results can be traced to what produced them. */
export const ENGINE = `axe-core ${AXE_VERSION} + ${CUSTOM_RULES.length} custom rules`;

const DEVICES = {
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
  const allRules = [...rules.values()];
  return {
    ...results[0],
    rules: allRules,
    meta: [...meta.values()],
    findings: merged,
    links: [...new Set(results.flatMap((r) => r.links || []))],
    score: pageScore(allRules),
  };
}

const NAV_TIMEOUT_MS = 45_000;
const SETTLE_TIMEOUT_MS = 5_000;
const MAX_HTML = 2_000;

/**
 * Start a headless Chromium-family browser. Prefers an installed Google
 * Chrome or Edge so nothing has to be downloaded; falls back to a Chromium
 * installed with `npx playwright-core install chromium`.
 */
export async function launchBrowser() {
  let lastError;
  for (const options of [...nativeArmLaunchers(), { channel: 'chrome' }, { channel: 'msedge' }, {}]) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    'Could not start a browser. Install Google Chrome, or run "npx playwright-core install chromium". ' +
      `Last error: ${String(lastError?.message || lastError).split('\n')[0]}`,
  );
}

const MAC_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/**
 * On an Apple Silicon Mac, an Intel build of Node runs under Rosetta, and any
 * browser it starts is translated too, which makes page scripts several times
 * slower. In that case start the browser through `arch -arm64` so it runs
 * natively. Returns launch options to try first, or [] when not needed.
 */
function nativeArmLaunchers() {
  if (process.platform !== 'darwin' || process.arch !== 'x64') return [];
  try {
    const translated = execFileSync('/usr/sbin/sysctl', ['-n', 'sysctl.proc_translated'], { encoding: 'utf8' }).trim();
    if (translated !== '1') return [];
  } catch {
    return []; // a real Intel Mac has no such key
  }
  const dir = mkdtempSync(join(tmpdir(), 'a11y-checker-'));
  return MAC_BROWSERS.filter((path) => existsSync(path)).map((path, i) => {
    const wrapper = join(dir, `browser-${i}.sh`);
    writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/arch -arm64 "${path}" "$@"\n`, { mode: 0o755 });
    return { executablePath: wrapper };
  });
}

/** Runs inside the page. Returns a trimmed, serializable copy of axe's results. */
/* c8 ignore start */
async function runAxeInPage({ runOptions, maxHtml }) {
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
    const prev = rules.get(rule.id);
    const impactRank = rank[rule.impact] || 0;
    if (!prev || order[outcome] > order[prev.outcome]) {
      rules.set(rule.id, { id: rule.id, outcome, impactRank, nodes: rule.nodes.length });
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

/** Load one URL in a fresh tab and evaluate it. Throws if the page cannot be loaded. */
export async function scanPage(context, url, { tags }) {
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    if (response && response.status() >= 400) {
      throw new Error(`The server answered HTTP ${response.status()}`);
    }
    const type = response?.headers()['content-type'] || '';
    if (type && !/html/i.test(type)) throw new Error(`Not an HTML page (${type.split(';')[0]})`);
    await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
    // Finish any fade or slide at once, so colours are not measured mid-animation.
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(runAxeInPage, {
      // Frames are not evaluated: axe would have to be injected into each one.
      runOptions: { runOnly: { type: 'tag', values: tags }, iframes: false, elementRef: false },
      maxHtml: MAX_HTML,
    });
    // Rules axe-core does not have; they reuse the axe instance already on the page.
    const custom = shapeCustomResults(await page.evaluate(runCustomRulesInPage, { maxHtml: MAX_HTML }));
    const rules = [...result.rules, ...custom.rules];
    return {
      ...result,
      rules,
      meta: [...result.meta, ...custom.meta],
      findings: [...result.findings, ...custom.findings],
      url: page.url(),
      score: pageScore(rules),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Scan the pages listed in `scan.urls`, then follow same-origin links
 * breadth-first until `scan.max_pages` pages have been attempted. Calls `onPage` after each page
 * with either a result or `{ url, error }`. Resolves when the crawl ends.
 */
export async function crawlAndScan(scan, onPage) {
  const standard = STANDARDS[scan.standard] || STANDARDS.wcag22aa;
  const tags = scan.best_practices ? [...standard.tags, 'best-practice'] : standard.tags;
  const devices = (VIEWPORTS[scan.viewport] || VIEWPORTS.desktop).devices;

  const browser = await launchBrowser();
  try {
    // bypassCSP lets the checker inject axe on sites with a strict script policy.
    const contexts = [];
    for (const name of devices) {
      contexts.push(await browser.newContext({ ...DEVICES[name], bypassCSP: true, reducedMotion: 'reduce' }));
    }
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
        const perViewport = [];
        for (const context of contexts) perViewport.push(await scanPage(context, url, { tags }));
        const result = mergeViewportResults(perViewport, devices);
        seen.add(normalizeUrl(result.url));
        for (const href of result.links) {
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
  } finally {
    await browser.close().catch(() => {});
  }
}
