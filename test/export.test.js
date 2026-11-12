// The published copy runs the API inside the page on an sql.js database.
// These tests run that same stack in Node (everything except the iframe
// scanner, which test/hosted.test.js covers in a real browser) and check it
// against the live server.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';
import { openStore } from '../src/db.js';
import { exportSite } from '../src/export.js';
import { createQueue } from '../src/core/jobs.js';
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
const fakeScanner = async (scan, onPage) => {
  await onPage(fakePage(`${scan.url}`, [
    finding('image-alt', 'fail', 4, 'img.logo'),
    finding('aria-expanded-not-allowed', 'fail', 3, 'nav.one'),
    finding('aria-expanded-not-allowed', 'fail', 3, 'nav.two'),
    finding('link-name-generic', 'review', 2, 'a.more'),
  ]));
  await onPage(fakePage(`${scan.url}about/`, [finding('image-alt', 'fail', 4, 'img.team')]));
};

let store, server, liveUrl, outDir, snapshot, hosted;

/** The published copy's stack, as public/browser-api.js builds it, from the exported files. */
async function startHosted(dir) {
  const lib = (file) => import(pathToFileURL(join(dir, 'lib', file)).href);
  const [{ createApi }, { createQueue: makeQueue }, { adaptSqlJs }, { createStore }, { engineLabel }] = await Promise.all(
    ['api.js', 'jobs.js', 'sqljs-adapter.js', 'store.js', 'engine.js'].map(lib),
  );
  const SQL = await initSqlJs();
  const db = adaptSqlJs(new SQL.Database(readFileSync(join(dir, 'checker.db'))));
  const hostedStore = createStore(db);
  const queue = makeQueue(hostedStore, fakeScanner);
  const handle = createApi({ store: hostedStore, queue, engine: engineLabel('test', 'run in the browser') });
  return { db, queue, handle, get: async (path) => (await handle('GET', path)).json };
}

before(async () => {
  store = openStore(':memory:');
  const queue = createQueue(store, fakeScanner);
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
  hosted = await startHosted(outDir);
});

after(() => {
  server?.close();
  server?.closeAllConnections();
  store?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const live = async (path) => (await fetch(liveUrl + path)).json();

test('the export writes a self-contained site marked as the published copy', () => {
  const files = ['index.html', 'app.js', 'browser-api.js', 'browser-scanner.js', 'styles.css', 'checker.db', 'snapshot.json', '.nojekyll',
    'lib/api.js', 'lib/store.js', 'lib/engine.js', 'lib/custom-rules.js', 'lib/sqljs-adapter.js',
    'vendor/axe.min.js', 'vendor/sql-wasm.js', 'vendor/sql-wasm.wasm', 'vendor/NOTICE.txt'];
  for (const file of files) assert.ok(existsSync(join(outDir, file)), `${file} is missing`);
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /<meta name="checker-mode" content="static">/);
  assert.doesNotMatch(html, /(href|src)="\//, 'asset paths must be relative so the site works under /accessibility-checker/');
  assert.deepEqual([snapshot.scans, snapshot.findings], [3, 10]);
  // Byte 18 of a SQLite file is 1 for a plain database and 2 for write-ahead logging, which a browser cannot open.
  assert.equal(readFileSync(join(outDir, 'checker.db'))[18], 1);
  // Nothing the browser loads may reach for Node.
  for (const file of ['api.js', 'store.js', 'engine.js', 'jobs.js', 'views.js', 'urls.js', 'sha1.js', 'custom-rules.js', 'search.js', 'score.js', 'wcag.js', 'sqljs-adapter.js']) {
    assert.doesNotMatch(readFileSync(join(outDir, 'lib', file), 'utf8'), /from 'node:|require\(/, `lib/${file} must be browser-safe`);
  }
});

test('the published copy answers every read exactly as the live server does', async () => {
  const search = encodeURIComponent(JSON.stringify([{ field: 'selector', op: 'starts_with', value: 'nav' }]));
  const paths = [
    '/api/scans', '/api/scans/1', '/api/scans/3', '/api/findings/2', '/api/findings/5',
    '/api/overview', '/api/overview?site=https%3A%2F%2Fexample.com', '/api/overview?site=https%3A%2F%2Fother.example',
    '/api/findings', '/api/findings?scan=1', '/api/findings?scan=2&rule=aria-expanded-not-allowed', '/api/findings?scan=1&kind=review',
    '/api/findings?status=dismissed', '/api/findings?impact=4&limit=1&offset=1', `/api/findings?scan=3&search=${search}`, '/api/findings?kind=fail&status=open',
  ];
  for (const path of paths) {
    assert.deepEqual(JSON.parse(JSON.stringify(await hosted.get(path))), await live(path), path);
  }
  const csv = await hosted.handle('GET', '/api/findings.csv?status=dismissed');
  assert.equal(csv.text, await (await fetch(`${liveUrl}/api/findings.csv?status=dismissed`)).text());
  assert.equal((await hosted.get('/api/config')).engine, 'axe-core test + 6 custom rules, run in the browser');
});

test('the published copy can scan, dismiss and remove, and survives being saved and reopened', async () => {
  const { handle, queue, db } = hosted;
  assert.equal((await handle('POST', '/api/scans', { urls: ['not a url'] })).status, 400);
  assert.equal((await handle('GET', '/api/scans/999')).status, 404);

  const created = await handle('POST', '/api/scans', { urls: ['https://new.example/', 'https://new.example/about/'] });
  assert.equal(created.status, 201);
  await queue.whenIdle();
  const detail = (await handle('GET', `/api/scans/${created.json.id}`)).json;
  assert.deepEqual([detail.scan.status, detail.scan.score, detail.pages.length], ['done', 70, 2]);
  assert.equal(detail.scan.engine, 'axe-core test + 6 custom rules, run in the browser');

  const mine = (await handle('GET', `/api/findings?scan=${created.json.id}`)).json;
  assert.equal(mine.total, 5);
  assert.equal((await handle('POST', '/api/findings/status', { ids: [mine.items[0].id], status: 'dismissed', reason: 'ok' })).json.changed, 1);

  // Saving exports the database; the copy must keep working afterwards, with foreign keys still enforced.
  const saved = db.export();
  const before = (await handle('GET', '/api/findings')).json.total;
  assert.equal((await handle('DELETE', '/api/scans/1')).status, 204);
  assert.equal((await handle('DELETE', `/api/scans/${created.json.id}`)).status, 204);
  assert.equal((await handle('GET', '/api/findings')).json.total, before - 5, 'removing a scan removes the findings only it had');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM scan_findings WHERE scan_id = ?').get(created.json.id).n, 0, 'rows of a removed scan are gone');

  // Reopening the saved bytes brings back the state at the time of saving.
  const SQL = await initSqlJs();
  const { adaptSqlJs } = await import(pathToFileURL(join(outDir, 'lib', 'sqljs-adapter.js')).href);
  const { createStore } = await import(pathToFileURL(join(outDir, 'lib', 'store.js')).href);
  const reopened = createStore(adaptSqlJs(new SQL.Database(saved)));
  assert.equal(reopened.getScan(created.json.id).status, 'done');
  assert.equal(reopened.getFinding(mine.items[0].id).dismiss_reason, 'ok');
  assert.equal(reopened.listScans(null).length, 4);
});
