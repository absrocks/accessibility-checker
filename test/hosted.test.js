// The published copy, in a real browser: it must scan pages by itself, with
// results that match the server scanner, and keep them across a reload.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/db.js';
import { exportSite } from '../src/export.js';
import { launchBrowser } from '../src/scanner.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'test', 'fixtures');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.txt': 'text/plain' };

/** Serve a folder. `headers` are added to every answer. */
function serve(dir, headers = {}) {
  const server = createServer(async (req, res) => {
    let rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    if (rel.endsWith('/')) rel += 'index.html';
    try {
      const body = await readFile(join(dir, rel));
      res.writeHead(200, { 'Content-Type': MIME[extname(rel)] || 'application/octet-stream', ...headers }).end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...headers }).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
const urlOf = (server) => `http://127.0.0.1:${server.address().port}`;

let browser = null;
try {
  browser = await launchBrowser();
} catch { /* tests below are skipped */ }

let outDir, store, hostedServer, openSite, closedSite, page;

before(async () => {
  if (!browser) return;
  store = openStore(':memory:');
  outDir = mkdtempSync(join(root, 'dist-test-'));
  exportSite(store, outDir);
  hostedServer = await serve(outDir);
  openSite = await serve(fixtures, { 'Access-Control-Allow-Origin': '*' }); // readable by other sites, like GitHub Pages
  closedSite = await serve(fixtures); // no permission header, like most servers
  page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(`${urlOf(hostedServer)}/`);
  await page.waitForFunction(() => typeof window.checkerApi === 'function' && document.querySelector('main h1'));
});

after(async () => {
  await browser?.close();
  for (const server of [hostedServer, openSite, closedSite]) {
    server?.close();
    server?.closeAllConnections();
  }
  store?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const api = (path, options) => page.evaluate(([p, o]) => window.checkerApi(p, o), [path, options]);
async function scanAndWait(body) {
  const created = await api('/api/scans', { method: 'POST', body });
  for (let i = 0; i < 120; i++) {
    const detail = await api(`/api/scans/${created.id}`);
    if (detail.scan.status === 'done' || detail.scan.status === 'failed') return detail;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('the scan did not finish');
}

test('scans listed pages in the browser and finds what the server scanner finds', { skip: !browser && 'no browser available' }, async () => {
  const site = urlOf(openSite);
  const detail = await scanAndWait({ urls: [`${site}/bad.html`, `${site}/good.html`], extraPages: 0 });
  assert.equal(detail.scan.status, 'done', detail.scan.error);
  assert.match(detail.scan.engine, /run in the browser$/);
  assert.deepEqual(detail.pages.map((p) => [p.url, p.error]), [[`${site}/bad.html`, null], [`${site}/good.html`, null]]);

  const failed = detail.rules.filter((r) => r.outcome === 'fail').map((r) => r.rule_id).sort();
  // The same rules test/e2e.test.js expects from the Playwright scanner on these fixtures.
  for (const rule of ['image-alt', 'label', 'button-name', 'color-contrast', 'html-has-lang', 'aria-allowed-attr',
    'aria-expanded-not-allowed', 'svg-accessible-name', 'link-name-suspicious', 'focusable-no-role',
    'link-name-not-unique', 'link-label-in-name', 'table-no-headers', 'contrast-translucent-background',
    'iframe-width-absolute', 'iframe-height-absolute']) {
    assert.ok(failed.includes(rule), `expected ${rule} to fail, got ${failed.join(', ')}`);
  }
  const outcome = (id) => detail.rules.find((r) => r.rule_id === id);
  assert.deepEqual(['link-name-generic', 'link-name-short', 'list-empty', 'label-empty'].map((id) => outcome(id)?.outcome), ['review', 'review', 'review', 'review']);
  assert.deepEqual([outcome('aria-expanded-not-allowed').open, outcome('focusable-no-role').open, outcome('svg-accessible-name').open], [1, 1, 1]);

  const [bad, good] = detail.pages;
  assert.deepEqual([good.fail_count, good.review_count, good.score], [0, 0, 85]);
  assert.ok(bad.score < 85);
  assert.equal(detail.scan.score, Math.round((bad.score + good.score) / 2));

  const findings = await api(`/api/findings?scan=${detail.scan.id}&rule=aria-expanded-not-allowed`);
  assert.match(findings.items[0].summary, /Seen at: desktop, mobile$/, 'both viewports were scanned');
});

test('follows links on the same site when asked for extra pages', { skip: !browser && 'no browser available' }, async () => {
  const site = urlOf(openSite);
  const detail = await scanAndWait({ urls: [`${site}/bad.html`], extraPages: 1, viewport: 'desktop' });
  assert.equal(detail.scan.status, 'done', detail.scan.error);
  assert.deepEqual(detail.pages.map((p) => p.url), [`${site}/bad.html`, `${site}/good.html`]);
});

test('says plainly when a site does not allow itself to be read', { skip: !browser && 'no browser available' }, async () => {
  const detail = await scanAndWait({ urls: [`${urlOf(closedSite)}/bad.html`] });
  assert.equal(detail.scan.status, 'failed');
  assert.match(detail.scan.error, /does not let other websites read its pages/);

  // A site that is not there at all is reported differently.
  const gone = await scanAndWait({ urls: ['http://127.0.0.1:9/bad.html'] });
  assert.equal(gone.scan.status, 'failed');
  assert.match(gone.scan.error, /could not be reached/);
});

test('refuses to report on a page whose styles did not load', { skip: !browser && 'no browser available' }, async () => {
  const detail = await scanAndWait({ urls: [`${urlOf(openSite)}/nostyle.html`], viewport: 'desktop' });
  assert.equal(detail.scan.status, 'failed');
  assert.match(detail.scan.error, /styles did not load \(http:\/\/127\.0\.0\.1:\d+\/missing-style\.css\)/);
});

test('scans a page whose third-party stylesheet did not load, and says so', { skip: !browser && 'no browser available' }, async () => {
  const detail = await scanAndWait({ urls: [`${urlOf(openSite)}/fonts-blocked.html`], viewport: 'desktop' });
  assert.equal(detail.scan.status, 'done', detail.scan.error);
  assert.equal(detail.pages[0].score, 85);
  assert.match(detail.pages[0].note, /^Scanned without a stylesheet from 127\.0\.0\.1:9, which did not load\./);
});

test('a scanned page cannot run its own scripts or reach the checker', { skip: !browser && 'no browser available' }, async () => {
  const site = urlOf(openSite);
  const detail = await scanAndWait({ urls: [`${site}/hostile.html`], viewport: 'desktop' });
  assert.equal(detail.scan.status, 'done', detail.scan.error);
  assert.equal(await page.evaluate(() => window.hostileRan), undefined, 'the page reached the checker window');
  assert.equal(await page.evaluate(() => document.title.includes('pwned')), false);
  const findings = await api(`/api/findings?scan=${detail.scan.id}&limit=200`);
  assert.ok(findings.items.every((f) => !/onerror|onclick/.test(f.html)), 'inline handlers were stripped before rendering');
});

test('keeps scans and changes across a reload, and resets on request', { skip: !browser && 'no browser available' }, async () => {
  const before = await api('/api/scans');
  assert.ok(before.length >= 3);
  const [first] = (await api(`/api/findings?scan=${before.at(-1).id}&limit=1`)).items;
  await api('/api/findings/status', { method: 'POST', body: { ids: [first.id], status: 'dismissed', reason: 'kept' } });
  await api(`/api/scans/${before[0].id}`, { method: 'DELETE' });
  await page.waitForTimeout(600); // saving is debounced

  await page.reload();
  await page.waitForFunction(() => typeof window.checkerApi === 'function' && document.querySelector('main h1'));
  const after = await api('/api/scans');
  assert.deepEqual(after.map((s) => s.id), before.slice(1).map((s) => s.id), 'the removed scan stays removed');
  assert.equal((await api(`/api/findings/${first.id}`)).dismiss_reason, 'kept');

  // The interface offers the reset, and it takes two presses.
  await page.goto(`${urlOf(hostedServer)}/#/scans`);
  const reset = page.getByRole('button', { name: /Reset to published results/ });
  await reset.click();
  await page.getByRole('button', { name: /Confirm reset/ }).click();
  await page.waitForFunction(() => typeof window.checkerApi === 'function' && document.querySelector('main h1'));
  await page.waitForFunction(async () => (await window.checkerApi('/api/scans')).length === 0);
});
