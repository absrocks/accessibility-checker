// End-to-end: real browser, real axe-core, real HTTP API, against local fixture pages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CUSTOM_RULES } from '../src/core/custom-rules.js';
import { openStore } from '../src/db.js';
import { createQueue } from '../src/core/jobs.js';
import { crawlAndScan, launchBrowser } from '../src/scanner.js';
import { createApp } from '../src/server.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

let browserAvailable = true;
try {
  await (await launchBrowser()).close();
} catch {
  browserAvailable = false;
}

let site, api, store, queue, siteUrl, apiUrl;

before(async () => {
  site = createServer(async (req, res) => {
    const name = req.url === '/' ? 'bad.html' : req.url.slice(1).split('?')[0];
    try {
      const html = await readFile(join(fixtures, name));
      res.writeHead(200, { 'Content-Type': name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }).end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });
  siteUrl = `http://127.0.0.1:${await listen(site)}`;
  store = openStore(':memory:');
  queue = createQueue(store, crawlAndScan);
  api = createServer(createApp(store, queue));
  apiUrl = `http://127.0.0.1:${await listen(api)}`;
});

after(() => {
  for (const server of [site, api]) {
    server?.close();
    server?.closeAllConnections();
  }
  store?.close();
});

const call = async (path, options) => {
  const res = await fetch(apiUrl + path, options);
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
};
const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('rejects scan requests it should not run', async () => {
  assert.equal((await post('/api/scans', { url: 'file:///etc/passwd' })).status, 400);
  assert.equal((await post('/api/scans', { url: 'https://example.com', maxPages: 500 })).status, 400);
  assert.equal((await post('/api/scans', { url: 'https://example.com', standard: 'nope' })).status, 400);
  assert.equal((await post('/api/scans', { urls: [] })).status, 400);
  assert.equal((await post('/api/scans', { urls: ['https://example.com/', 'not a url'] })).status, 400);
  assert.equal((await post('/api/scans', { urls: ['https://example.com/'], extraPages: 50 })).status, 400);
  assert.equal((await post('/api/scans', { urls: ['https://example.com/'], extraPages: 'lots' })).status, 400);
  assert.equal((await call('/api/scans/999')).status, 404);
  assert.equal((await call('/api/findings?search=%5B%7B%22field%22%3A%22html%22%2C%22op%22%3A%22regex%22%2C%22value%22%3A%22(%22%7D%5D')).status, 400);
});

test('crawls the fixture site and reports the known problems', { skip: !browserAvailable && 'no browser available' }, async () => {
  const created = await post('/api/scans', { url: `${siteUrl}/`, maxPages: 2 }); // the query-string links on the bad page are never reached
  assert.equal(created.status, 201);
  await queue.whenIdle();

  const { body } = await call(`/api/scans/${created.body.id}`);
  assert.equal(body.scan.status, 'done', body.scan.error);
  assert.equal(body.scan.pages_scanned, 2, 'followed the link from the bad page to the good page');

  const failed = body.rules.filter((r) => r.outcome === 'fail').map((r) => r.rule_id);
  for (const rule of ['image-alt', 'label', 'button-name', 'color-contrast', 'html-has-lang', 'aria-allowed-attr']) {
    assert.ok(failed.includes(rule), `expected ${rule} to fail, got ${failed.join(', ')}`);
  }

  // Rules ported from the Docs CI script, which axe-core does not have.
  for (const rule of ['aria-expanded-not-allowed', 'svg-accessible-name', 'link-name-suspicious', 'focusable-no-role',
    'link-name-not-unique', 'link-label-in-name', 'table-no-headers', 'contrast-translucent-background',
    'iframe-width-absolute', 'iframe-height-absolute']) {
    assert.ok(failed.includes(rule), `expected custom rule ${rule} to fail, got ${failed.join(', ')}`);
  }
  const outcome = (id) => body.rules.find((r) => r.rule_id === id);
  assert.deepEqual(['link-name-generic', 'link-name-short', 'list-empty', 'label-empty'].map((id) => outcome(id)?.outcome), ['review', 'review', 'review', 'review']);
  assert.deepEqual([outcome('link-name-not-unique').open, outcome('link-label-in-name').open, outcome('table-no-headers').open], [2, 1, 1]);
  assert.deepEqual([outcome('aria-expanded-not-allowed').open, outcome('svg-accessible-name').open, outcome('link-name-suspicious').open], [1, 1, 1]);
  assert.equal(outcome('focusable-no-role').open, 1, 'the div is flagged; the focusable label is not');
  assert.equal(outcome('aria-expanded-not-allowed').custom, true);
  assert.deepEqual(outcome('aria-expanded-not-allowed').criteria.map((c) => c.num), ['4.1.2']);

  const bad = body.pages.find((p) => p.url.endsWith('/'));
  const good = body.pages.find((p) => p.url.endsWith('/good.html'));
  assert.equal(good.fail_count, 0, 'the good page has no failed findings');
  assert.equal(good.review_count, 0, 'allowed aria-expanded, named and hidden SVGs, and a descriptive link are not flagged');
  assert.equal(good.score, 85, 'nothing failing scores the maximum, 85');
  assert.ok(bad.score < good.score, `bad page (${bad.score}) scores below good page (${good.score})`);

  const contrast = body.rules.find((r) => r.rule_id === 'color-contrast');
  assert.deepEqual(contrast.criteria.map((c) => c.num), ['1.4.3']);

  // Advanced search narrows to the element; dismissing it survives a re-run.
  const search = encodeURIComponent(JSON.stringify([{ field: 'html', op: 'contains', value: 'aria-checked' }]));
  const found = (await call(`/api/findings?scan=${created.body.id}&rule=aria-allowed-attr&search=${search}`)).body;
  assert.equal(found.total, 1);
  assert.match(found.items[0].html, /^<h2 aria-checked/);

  const dismissed = await post('/api/findings/status', { ids: [found.items[0].id], status: 'dismissed', reason: 'test' });
  assert.equal(dismissed.body.changed, 1);

  const rerun = await post(`/api/scans/${created.body.id}/rerun`, {});
  await queue.whenIdle();
  const second = (await call(`/api/scans/${rerun.body.id}`)).body;
  const rule = second.rules.find((r) => r.rule_id === 'aria-allowed-attr');
  assert.deepEqual([rule.open, rule.dismissed], [0, 1]);

  const overview = (await call('/api/overview')).body;
  assert.equal(overview.trend.length, 2);
  assert.equal(overview.latest.id, rerun.body.id);

  const csv = await call(`/api/findings.csv?scan=${rerun.body.id}&status=dismissed`);
  assert.equal(csv.body.trim().split('\r\n').length, 2, 'header plus the one dismissed finding');
});

test('scans exactly the pages that were listed, and removing the scan removes its results', { skip: !browserAvailable && 'no browser available' }, async () => {
  // Listed in this order, with a duplicate; no links are followed because extraPages is 0.
  const created = await post('/api/scans', { urls: [`${siteUrl}/good.html`, `${siteUrl}/bad.html`, `${siteUrl}/good.html#top`], extraPages: 0, viewport: 'desktop' });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.pages_listed, [`${siteUrl}/good.html`, `${siteUrl}/bad.html`]);
  assert.equal(created.body.max_pages, 2);
  await queue.whenIdle();

  const { body } = await call(`/api/scans/${created.body.id}`);
  assert.equal(body.scan.status, 'done', body.scan.error);
  assert.deepEqual(body.pages.map((p) => p.url), [`${siteUrl}/good.html`, `${siteUrl}/bad.html`]);
  const [good, bad] = body.pages;
  assert.equal(body.scan.score, Math.round((good.score + bad.score) / 2), 'the scan score is the mean of the listed pages');

  // bad.html was never scanned before under this address, so its findings exist only in this scan.
  const before = (await call(`/api/findings?scan=${created.body.id}`)).body.total;
  assert.ok(before > 0);
  const all = (await call('/api/findings?limit=1')).body.total;
  assert.equal((await call(`/api/scans/${created.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await call(`/api/scans/${created.body.id}`)).status, 404);
  assert.equal((await call('/api/findings?limit=1')).body.total, all - before, 'findings seen only in the removed scan are gone');
});

test('refuses to report on a page whose styles did not load', { skip: !browserAvailable && 'no browser available' }, async () => {
  const created = await post('/api/scans', { urls: [`${siteUrl}/nostyle.html`], viewport: 'desktop' });
  await queue.whenIdle();
  const { body } = await call(`/api/scans/${created.body.id}`);
  assert.equal(body.scan.status, 'failed');
  assert.match(body.scan.error, /styles did not load \(http:\/\/127\.0\.0\.1:\d+\/missing-style\.css\)/);
});

test('scans a page whose third-party stylesheet did not load, and says so', { skip: !browserAvailable && 'no browser available' }, async () => {
  const created = await post('/api/scans', { urls: [`${siteUrl}/fonts-blocked.html`, `${siteUrl}/good.html`], viewport: 'desktop' });
  await queue.whenIdle();
  const { body } = await call(`/api/scans/${created.body.id}`);
  assert.equal(body.scan.status, 'done', body.scan.error);
  const [blocked, good] = body.pages;
  assert.equal(blocked.score, 85);
  assert.match(blocked.note, /^Scanned without a stylesheet from 127\.0\.0\.1:9, which did not load\./);
  assert.equal(good.note, null, 'a page that loaded everything has no note');
});

test('every custom rule fires on the bad fixtures and none fires on the good one', { skip: !browserAvailable && 'no browser available' }, async () => {
  const created = await post('/api/scans', { urls: [`${siteUrl}/bad.html`, `${siteUrl}/bad2.html`, `${siteUrl}/good.html`], extraPages: 0 });
  await queue.whenIdle();
  const { body } = await call(`/api/scans/${created.body.id}`);
  assert.equal(body.scan.status, 'done', body.scan.error);

  const outcome = new Map(body.rules.map((r) => [r.rule_id, r.outcome]));
  for (const rule of CUSTOM_RULES) {
    assert.equal(outcome.get(rule.id), rule.level === 'error' ? 'fail' : 'review', `${rule.id} on the bad fixtures`);
  }
  const good = body.pages.find((p) => p.url.endsWith('/good.html'));
  const onGood = (await call(`/api/findings?scan=${created.body.id}&page=${good.id}&limit=200`)).body.items;
  assert.deepEqual(onGood.map((f) => `${f.rule_id}: ${f.selector}`), [], 'the good page must have no findings at all');
  assert.equal(good.score, 85);
});
