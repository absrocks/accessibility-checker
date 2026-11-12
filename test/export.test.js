// The static snapshot must answer the same questions as the live API.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore } from '../src/db.js';
import { exportSite } from '../src/export.js';
import { createQueue } from '../src/jobs.js';
import { createApp } from '../src/server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const rule = (id, tags) => ({ id, help: `Help for ${id}`, description: `About ${id}`, helpUrl: `https://example.com/${id}`, tags });
const fakePage = (url, findings) => ({
  url,
  title: `Title of ${url}`,
  score: 70,
  meta: [rule('image-alt', ['wcag2a', 'wcag111']), rule('aria-expanded-not-allowed', ['custom', 'wcag2a', 'wcag412']), rule('link-name-generic', ['custom', 'wcag2a', 'wcag244'])],
  rules: [
    { id: 'image-alt', outcome: 'fail', impactRank: 4, nodes: 1 },
    { id: 'aria-expanded-not-allowed', outcome: 'fail', impactRank: 3, nodes: 2 },
    { id: 'link-name-generic', outcome: 'review', impactRank: 2, nodes: 1 },
  ],
  findings,
});
const finding = (ruleId, kind, impactRank, selector) => ({ ruleId, kind, impactRank, selector, html: `<x data-sel="${selector}">`, summary: 'Fix it' });

let store, server, liveUrl, staticApi, outDir, snapshot;

before(async () => {
  store = openStore(':memory:');
  const queue = createQueue(store, async (scan, onPage) => {
    await onPage(fakePage(`${scan.url}`, [
      finding('image-alt', 'fail', 4, 'img.logo'),
      finding('aria-expanded-not-allowed', 'fail', 3, 'nav.one'),
      finding('aria-expanded-not-allowed', 'fail', 3, 'nav.two'),
      finding('link-name-generic', 'review', 2, 'a.more'),
    ]));
    await onPage(fakePage(`${scan.url}about/`, [finding('image-alt', 'fail', 4, 'img.team')]));
  });
  const make = (url) => store.createScan({ url, origin: new URL(url).origin, standard: 'wcag22aa', bestPractices: true, viewport: 'both', maxPages: 2, engine: 'test' });
  for (const url of ['https://example.com/', 'https://example.com/', 'https://other.example/']) queue.enqueue(make(url).id);
  await queue.whenIdle();
  store.setFindingStatus([2], 'dismissed', 'handled by the theme');

  server = createServer(createApp(store, queue));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  liveUrl = `http://127.0.0.1:${server.address().port}`;

  // Inside the project so the exported modules are loaded as ES modules.
  outDir = mkdtempSync(join(root, 'dist-test-'));
  snapshot = exportSite(store, outDir);
  const { staticApiFrom } = await import(pathToFileURL(join(outDir, 'static-api.js')).href);
  staticApi = staticApiFrom(JSON.parse(readFileSync(join(outDir, 'data.json'), 'utf8')));
});

after(() => {
  server?.close();
  server?.closeAllConnections();
  store?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const live = async (path) => (await fetch(liveUrl + path)).json();

test('the export writes a self-contained site marked as a snapshot', () => {
  for (const file of ['index.html', 'app.js', 'static-api.js', 'search.js', 'styles.css', 'data.json', '.nojekyll']) {
    assert.ok(existsSync(join(outDir, file)), `${file} is missing`);
  }
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /<meta name="checker-mode" content="static">/);
  assert.doesNotMatch(html, /(href|src)="\//, 'asset paths must be relative so the site works under /accessibility-checker/');
  assert.equal(snapshot.scans.length, 3);
});

test('the snapshot answers scan pages exactly as the live API does', async () => {
  for (const path of ['/api/config', '/api/scans', '/api/scans/1', '/api/scans/3', '/api/findings/2', '/api/findings/5']) {
    assert.deepEqual(await staticApi(path), await live(path), path);
  }
});

test('the snapshot filters, searches and pages findings like the live API', async () => {
  const search = encodeURIComponent(JSON.stringify([{ field: 'selector', op: 'starts_with', value: 'nav' }]));
  const paths = [
    '/api/findings',
    '/api/findings?scan=1',
    '/api/findings?scan=2&rule=aria-expanded-not-allowed',
    '/api/findings?scan=1&kind=review',
    '/api/findings?status=dismissed',
    '/api/findings?impact=4&limit=1&offset=1',
    `/api/findings?scan=3&search=${search}`,
    '/api/findings?kind=fail&status=open',
  ];
  for (const path of paths) {
    const [a, b] = [await staticApi(path), await live(path)];
    assert.deepEqual([a.total, a.offset, a.limit, a.items.map((f) => f.id)], [b.total, b.offset, b.limit, b.items.map((f) => f.id)], path);
    assert.ok(a.total > 0 || path.includes('offset'), `${path} should match something`);
  }
  const page2 = (await live('/api/scans/1')).pages[1].id;
  assert.deepEqual((await staticApi(`/api/findings?scan=1&page=${page2}`)).items.map((f) => f.id), (await live(`/api/findings?scan=1&page=${page2}`)).items.map((f) => f.id));
});

test('the snapshot overview matches, including the per-site filter', async () => {
  for (const path of ['/api/overview', '/api/overview?site=https%3A%2F%2Fexample.com', '/api/overview?site=https%3A%2F%2Fother.example']) {
    const [a, b] = [await staticApi(path), await live(path)];
    assert.deepEqual(a.sites, b.sites, path);
    assert.deepEqual(a.trend, b.trend, path);
    assert.deepEqual(a.previous, b.previous, path);
    assert.deepEqual([a.latest.id, a.latest.score, a.latest.severity], [b.latest.id, b.latest.score, b.latest.severity], path);
    assert.deepEqual(a.recent.map((s) => s.id), b.recent.map((s) => s.id), path);
  }
});

test('the snapshot refuses changes and reports bad input', async () => {
  await assert.rejects(staticApi('/api/scans', { method: 'POST' }), /read-only snapshot/);
  await assert.rejects(staticApi('/api/findings/status', { method: 'POST' }), /read-only snapshot/);
  await assert.rejects(staticApi('/api/scans/999'), /Scan not found/);
  await assert.rejects(staticApi('/api/findings?search=%5B%7B%22field%22%3A%22html%22%2C%22op%22%3A%22regex%22%2C%22value%22%3A%22(%22%7D%5D'), /invalid regular expression/);
});
