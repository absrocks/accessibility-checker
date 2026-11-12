import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../src/db.js';
import { createQueue } from '../src/core/jobs.js';
import { CUSTOM_RULES, shapeCustomResults } from '../src/core/custom-rules.js';
import { mergeViewportResults } from '../src/core/engine.js';
import { pageScore, scanScore } from '../src/core/score.js';
import { SearchError, compileSearch } from '../src/core/search.js';
import { fingerprint, isCrawlable, normalizeUrl, parseTarget } from '../src/core/urls.js';
import { criteriaFromTags, levelOfRule } from '../src/core/wcag.js';

test('criteriaFromTags reads one- and two-digit criterion numbers', () => {
  const got = criteriaFromTags(['cat.aria', 'wcag2a', 'wcag412', 'wcag1410']);
  assert.deepEqual(got.map((c) => [c.num, c.name, c.level]), [
    ['4.1.2', 'Name, Role, Value', 'A'],
    ['1.4.10', 'Reflow', 'AA'],
  ]);
});

test('levelOfRule falls back to best practice', () => {
  assert.equal(levelOfRule(['wcag2aa', 'wcag143']), 'AA');
  assert.equal(levelOfRule(['wcag2a', 'wcag111']), 'A');
  assert.equal(levelOfRule(['best-practice', 'cat.semantics']), 'Best practice');
});

test('pageScore starts at 85 and loses about a point per failing rule', () => {
  const passes = Array.from({ length: 9 }, () => ({ outcome: 'pass' }));
  const fail = (impactRank, extra = {}) => ({ outcome: 'fail', impactRank, ...extra });
  const score = (...failing) => pageScore([...passes, ...failing, { outcome: 'review', impactRank: 4 }, { outcome: 'inapplicable' }]);

  assert.equal(score(), 85, 'nothing failing is 85, not 100');
  assert.equal(score(fail(3)), 84);          // 85 - 0.93, rounded down
  assert.equal(score(fail(1)), 84);          // 85 - 0.65
  assert.equal(score(fail(3), fail(3)), 83); // 85 - 1.86
  assert.equal(score(fail(3, { passed: 0, failed: 28 })), score(fail(3, { passed: 27, failed: 1 })), 'how many elements fail a rule does not matter');
  assert.equal(pageScore(Array.from({ length: 200 }, () => fail(4))), 0, 'never below zero');

  // Level Access's four scans of the HPC pages: serious (its "High") and minor (its "Low") failing rules -> its score.
  for (const [serious, minor, levelAccess] of [[4, 1, 80], [4, 2, 79], [6, 1, 78], [6, 2, 78]]) {
    const rules = [...passes, ...Array.from({ length: serious }, () => fail(3)), ...Array.from({ length: minor }, () => fail(1))];
    assert.equal(pageScore(rules), levelAccess, `${serious} serious + ${minor} minor failing rules`);
  }

  // Best-practice rules are reported but never change the score, pass or fail.
  assert.equal(pageScore([...passes, fail(3), { outcome: 'pass', scored: false }, { ...fail(4), scored: false }]), 84);
  assert.equal(pageScore([{ outcome: 'inapplicable' }]), null);
  assert.equal(pageScore([{ outcome: 'pass', scored: false }]), null, 'only best-practice rules evaluated: no score');
});

test('scanScore averages only pages that have a score', () => {
  assert.equal(scanScore([80, null, 90]), 85);
  assert.equal(scanScore([null]), null);
});

test('parseTarget accepts only http and https and drops the fragment', () => {
  assert.equal(parseTarget('https://example.com/a#top').href, 'https://example.com/a');
  assert.equal(parseTarget('file:///etc/passwd'), null);
  assert.equal(parseTarget('javascript:alert(1)'), null);
  assert.equal(parseTarget('not a url'), null);
});

test('isCrawlable stays on the origin and skips downloads', () => {
  const origin = 'https://example.com';
  assert.equal(isCrawlable('https://example.com/about', origin), true);
  assert.equal(isCrawlable('https://other.example.com/about', origin), false);
  assert.equal(isCrawlable('https://example.com/report.pdf', origin), false);
  assert.equal(isCrawlable('mailto:someone@example.com', origin), false);
});

test('fingerprint is stable across fragments and differs by element', () => {
  const a = fingerprint('image-alt', 'https://example.com/#x', 'img');
  assert.equal(a, fingerprint('image-alt', 'https://example.com/', 'img'));
  assert.notEqual(a, fingerprint('image-alt', 'https://example.com/', 'img:nth-child(2)'));
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com/');
});

test('compileSearch combines clauses and rejects bad input', () => {
  const row = { html: '<nav aria-expanded="true">', selector: 'nav', url: 'https://example.com/MIG/', page_title: 'MIG' };
  const match = (clauses) => compileSearch(JSON.stringify(clauses))(row);
  assert.equal(match([{ field: 'html', op: 'contains', value: 'ARIA-EXPANDED' }]), true);
  assert.equal(match([{ field: 'url', op: 'ends_with', value: '/mig/' }, { field: 'selector', op: 'not_contains', value: 'div' }]), true);
  assert.equal(match([{ field: 'title', op: 'starts_with', value: 'x' }]), false);
  assert.equal(match([{ field: 'html', op: 'regex', value: '^<nav\\b' }]), true);
  assert.equal(compileSearch('')(row), true);
  assert.throws(() => compileSearch('[{"field":"html","op":"regex","value":"("}]'), SearchError);
  assert.throws(() => compileSearch('[{"field":"nope","op":"contains","value":"x"}]'), SearchError);
  assert.throws(() => compileSearch('{'), SearchError);
});

// ---- storage and queue, with a fake scanner so no browser is needed ----

const page = (url, findings, extra = {}) => ({
  url,
  title: 'Page',
  score: 80,
  meta: [{ id: 'image-alt', help: 'Images must have alternative text', description: 'd', helpUrl: 'https://example.com/help', tags: ['wcag2a', 'wcag111'] }],
  rules: [{ id: 'image-alt', outcome: findings.length ? 'fail' : 'pass', impactRank: 4, nodes: findings.length }],
  findings: findings.map((selector) => ({ ruleId: 'image-alt', kind: 'fail', impactRank: 4, selector, html: `<img id="${selector}">`, summary: 'Fix it' })),
  ...extra,
});

const newScan = (store) =>
  store.createScan({ url: 'https://example.com/', origin: 'https://example.com', standard: 'wcag22aa', bestPractices: false, viewport: 'desktop', maxPages: 2, engine: 'test' });

test('a finding keeps its identity and dismissal across scans', async () => {
  const store = openStore(':memory:');
  const queue = createQueue(store, async (_scan, onPage) => {
    await onPage(page('https://example.com/', ['img.a', 'img.b']));
  });

  const first = newScan(store);
  queue.enqueue(first.id);
  await queue.whenIdle();
  assert.equal(store.getScan(first.id).status, 'done');
  assert.equal(store.getScan(first.id).score, 80);

  const [a] = store.findFindings({ scanId: first.id });
  assert.equal(store.setFindingStatus([a.id], 'dismissed', 'decorative'), 1);
  assert.deepEqual(store.scanSeverity(first.id), [0, 0, 0, 0, 1]);

  const second = newScan(store);
  queue.enqueue(second.id);
  await queue.whenIdle();

  assert.equal(store.findFindings({}).length, 2, 'no duplicate findings after a second scan');
  const again = store.getFinding(a.id);
  assert.equal(again.status, 'dismissed');
  assert.equal(again.dismiss_reason, 'decorative');
  assert.equal(again.seen_in.length, 2);

  const rule = store.scanRules(second.id).find((r) => r.rule_id === 'image-alt');
  assert.deepEqual([rule.outcome, rule.open, rule.dismissed], ['fail', 1, 1]);

  store.deleteScan(first.id);
  store.deleteScan(second.id);
  assert.equal(store.findFindings({}).length, 0, 'findings with no remaining scan are removed');
  store.close();
});

test('a scan where no page loads is marked failed, and a crash is recorded', async () => {
  const store = openStore(':memory:');
  const unreachable = createQueue(store, async (_scan, onPage) => {
    await onPage({ url: 'https://example.com/', error: 'net::ERR_NAME_NOT_RESOLVED' });
  });
  const one = newScan(store);
  unreachable.enqueue(one.id);
  await unreachable.whenIdle();
  assert.deepEqual([store.getScan(one.id).status, store.getScan(one.id).error], ['failed', 'net::ERR_NAME_NOT_RESOLVED']);

  const crashing = createQueue(store, async () => { throw new Error('browser went away'); });
  const two = newScan(store);
  crashing.enqueue(two.id);
  await crashing.whenIdle();
  assert.deepEqual([store.getScan(two.id).status, store.getScan(two.id).error], ['failed', 'browser went away']);
  store.close();
});

test('queued scans run one at a time, in order', async () => {
  const store = openStore(':memory:');
  const order = [];
  let running = 0;
  const queue = createQueue(store, async (scan, onPage) => {
    running += 1;
    assert.equal(running, 1);
    await new Promise((r) => setTimeout(r, 5));
    order.push(scan.id);
    await onPage(page('https://example.com/', []));
    running -= 1;
  });
  const ids = [newScan(store).id, newScan(store).id, newScan(store).id];
  ids.forEach((id) => queue.enqueue(id));
  await queue.whenIdle();
  assert.deepEqual(order, ids);
  assert.ok(ids.every((id) => store.getScan(id).status === 'done'));
  store.close();
});

test('custom rule results become pass, fail, review or inapplicable', () => {
  const shaped = shapeCustomResults({
    examined: { 'aria-expanded-not-allowed': 3, 'link-name-suspicious': 5, 'link-name-generic': 5, 'link-name-short': 5 },
    hits: [
      { rule: 'aria-expanded-not-allowed', selector: 'nav', html: '<nav aria-expanded="false">', detail: 'The element\'s role is "navigation"' },
      { rule: 'link-name-generic', selector: 'a.more', html: '<a class="more">more</a>', detail: 'The link\'s name is "more"' },
    ],
  });
  const outcome = Object.fromEntries(shaped.rules.map((r) => [r.id, r.outcome]));
  assert.deepEqual(outcome, {
    'aria-expanded-not-allowed': 'fail',
    'focusable-no-role': 'inapplicable',
    'svg-accessible-name': 'inapplicable',
    'link-name-suspicious': 'pass',
    'link-name-not-unique': 'inapplicable',
    'link-label-in-name': 'inapplicable',
    'table-no-headers': 'inapplicable',
    'list-empty': 'inapplicable',
    'label-empty': 'inapplicable',
    'contrast-translucent-background': 'inapplicable',
    'link-name-generic': 'review',
    'link-name-short': 'pass',
  });
  // Element counts feed the score: 3 checked, 1 flagged.
  const expanded = shaped.rules.find((r) => r.id === 'aria-expanded-not-allowed');
  assert.deepEqual([expanded.passed, expanded.failed], [2, 1]);
  assert.deepEqual(shaped.findings.map((f) => [f.ruleId, f.kind]), [['aria-expanded-not-allowed', 'fail'], ['link-name-generic', 'review']]);
  assert.equal(shaped.meta.length, CUSTOM_RULES.length);
  assert.ok(CUSTOM_RULES.every((r) => r.tags.includes('custom')));
});

test('results from two viewports merge into one set of findings', () => {
  const at = (rules, findings) => ({ url: 'https://example.com/', title: 'T', meta: [], links: [], rules, findings, score: null });
  const nav = (n) => ({ ruleId: 'aria-expanded-not-allowed', kind: 'fail', impactRank: 3, selector: `nav:nth-child(${n})`, html: '', summary: 'role is "navigation"' });
  const desktop = at([{ id: 'aria-expanded-not-allowed', outcome: 'fail', impactRank: 3, nodes: 1 }, { id: 'image-alt', outcome: 'pass', impactRank: 0, nodes: 2 }], [nav(1)]);
  const mobile = at([{ id: 'aria-expanded-not-allowed', outcome: 'fail', impactRank: 3, nodes: 3 }, { id: 'image-alt', outcome: 'inapplicable', impactRank: 0, nodes: 0 }], [nav(1), nav(2), nav(3)]);

  const merged = mergeViewportResults([desktop, mobile], ['desktop', 'mobile']);
  assert.equal(merged.findings.length, 3, 'the element seen at both widths is counted once');
  assert.match(merged.findings.find((f) => f.selector === 'nav:nth-child(1)').summary, /Seen at: desktop, mobile$/);
  assert.match(merged.findings.find((f) => f.selector === 'nav:nth-child(2)').summary, /Seen at: mobile$/);
  assert.deepEqual(merged.rules.map((r) => [r.id, r.outcome, r.nodes]), [['aria-expanded-not-allowed', 'fail', 3], ['image-alt', 'pass', 2]]);
  assert.equal(merged.score, 84); // one serious rule failing
  assert.equal(mergeViewportResults([desktop], ['desktop']), desktop);
});

test('stored scans are rescored with the current formula', () => {
  const store = openStore(':memory:');
  const scan = (n) => {
    const s = store.createScan({ url: `https://example.com/${n}`, origin: 'https://example.com', standard: 'wcag22aa', bestPractices: false, viewport: 'both', maxPages: 1, engine: 'old' });
    store.markRunning(s.id);
    store.savePage(s.id, {
      url: `https://example.com/${n}`, title: 'T', score: 95, // what an earlier formula stored
      meta: [{ id: 'aria-expanded-not-allowed', help: 'h', description: 'd', helpUrl: null, tags: ['custom', 'wcag2a', 'wcag412'] },
        { id: 'image-alt', help: 'h', description: 'd', helpUrl: null, tags: ['wcag2a', 'wcag111'] },
        { id: 'region', help: 'h', description: 'd', helpUrl: null, tags: ['best-practice'] }],
      rules: [{ id: 'aria-expanded-not-allowed', outcome: 'fail', impactRank: 3, nodes: n }, { id: 'image-alt', outcome: 'pass', impactRank: 0, nodes: 4 },
        { id: 'region', outcome: 'fail', impactRank: 2, nodes: 9 }],
      findings: Array.from({ length: n }, (_, i) => ({ ruleId: 'aria-expanded-not-allowed', kind: 'fail', impactRank: 3, selector: `nav:nth-child(${i + 1})`, html: '<nav>', summary: '' })),
    });
    store.finishScan(s.id);
    return s.id;
  };
  const [many, one] = [scan(28), scan(1)];
  assert.equal(store.getScan(many).score, 95);
  store.rescoreAll();
  // One WCAG rule fails in both; the best-practice failure is ignored.
  assert.deepEqual([store.getScan(many).score, store.getScan(one).score], [84, 84]);
  store.close();
});
