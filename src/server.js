import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { openStore } from './db.js';
import { createQueue } from './jobs.js';
import { ENGINE, VIEWPORTS } from './scanner.js';
import { IMPACT_LABEL } from './score.js';
import { SearchError, compileSearch } from './search.js';
import { parseTarget } from './urls.js';
import { MAX_PAGES, configView, describeScan, findingDetail, scanDetail } from './views.js';
import { STANDARDS } from './wcag.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const int = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const oneOf = (v, allowed) => (allowed.includes(v) ? v : null);

function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheets from treating cells as formulas
  return `"${s.replace(/"/g, '""')}"`;
}

/** Filters shared by the findings list and its CSV export. */
function readFindingFilters(query) {
  return {
    scanId: int(query.scan),
    ruleId: query.rule ? String(query.rule) : null,
    pageId: int(query.page),
    kind: oneOf(query.kind, ['fail', 'review']),
    status: oneOf(query.status, ['open', 'dismissed']),
    impact: int(query.impact),
    sort: query.sort ? String(query.sort) : null,
  };
}

export function createApp(store, queue) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use(express.static(join(root, 'public')));

  const requireScan = (req, res) => {
    const scan = store.getScan(int(req.params.id) ?? -1);
    if (!scan) res.status(404).json({ error: 'Scan not found' });
    return scan;
  };

  app.get('/api/config', (_req, res) => res.json(configView()));

  app.get('/api/overview', (req, res) => {
    const site = req.query.site ? String(req.query.site) : null;
    const trend = store.trend(site);
    const latest = trend.at(-1) || null;
    const previous = trend.at(-2) || null;
    res.json({
      sites: store.listSites(),
      latest: latest && { ...describeScan(store.getScan(latest.id)), severity: latest.severity },
      previous: previous && { id: previous.id, score: previous.score, severity: previous.severity },
      trend,
      recent: store.listScans(site).slice(0, 10).map(describeScan),
    });
  });

  app.get('/api/scans', (req, res) => {
    res.json(store.listScans(req.query.site ? String(req.query.site) : null).map(describeScan));
  });

  app.post('/api/scans', (req, res) => {
    const body = req.body || {};
    // Pages to check: a list in `urls`, or a single `url`.
    const given = Array.isArray(body.urls) ? body.urls : [body.url];
    const targets = [];
    for (const entry of given) {
      const target = parseTarget(entry);
      if (!target) {
        const shown = String(entry ?? '').slice(0, 80);
        return res.status(400).json({ error: `${shown ? `"${shown}" is not a full address. ` : ''}Enter full http or https addresses, for example https://example.com/` });
      }
      if (!targets.some((t) => t.href === target.href)) targets.push(target);
    }
    if (!targets.length) return res.status(400).json({ error: 'Enter at least one page address' });
    // Total pages: the listed ones plus `extraPages` found by following links, or `maxPages` in all.
    const extra = int(body.extraPages);
    if (body.extraPages != null && extra === null) return res.status(400).json({ error: 'Extra pages must be a whole number' });
    const maxPages = body.extraPages != null ? targets.length + extra : Math.max(int(body.maxPages) ?? targets.length, targets.length);
    if (maxPages < 1 || maxPages > MAX_PAGES) return res.status(400).json({ error: `A scan can cover at most ${MAX_PAGES} pages; this one asks for ${maxPages}` });
    const target = targets[0];
    const standard = body.standard ?? 'wcag22aa';
    if (!STANDARDS[standard]) return res.status(400).json({ error: 'Unknown standard' });
    const viewport = body.viewport ?? 'both';
    if (!VIEWPORTS[viewport]) return res.status(400).json({ error: 'Unknown viewport' });

    const scan = store.createScan({
      url: target.href,
      origin: target.origin,
      urls: targets.map((t) => t.href),
      standard,
      bestPractices: Boolean(body.bestPractices),
      viewport,
      maxPages,
      engine: ENGINE,
    });
    queue.enqueue(scan.id);
    res.status(201).json(describeScan(scan));
  });

  app.post('/api/scans/:id/rerun', (req, res) => {
    const old = requireScan(req, res);
    if (!old) return;
    const scan = store.createScan({
      url: old.url,
      origin: old.origin,
      urls: old.urls ? JSON.parse(old.urls) : [old.url],
      standard: old.standard,
      bestPractices: old.best_practices,
      viewport: old.viewport,
      maxPages: old.max_pages,
      engine: ENGINE,
    });
    queue.enqueue(scan.id);
    res.status(201).json(describeScan(scan));
  });

  app.delete('/api/scans/:id', (req, res) => {
    const scan = requireScan(req, res);
    if (!scan) return;
    if (queue.isBusy(scan.id)) return res.status(409).json({ error: 'This scan is still running' });
    store.deleteScan(scan.id);
    res.status(204).end();
  });

  app.get('/api/scans/:id', (req, res) => {
    const scan = requireScan(req, res);
    if (scan) res.json(scanDetail(store, scan));
  });

  app.get('/api/findings', (req, res) => {
    let matches;
    try {
      matches = store.findFindings(readFindingFilters(req.query)).filter(compileSearch(req.query.search));
    } catch (e) {
      if (e instanceof SearchError) return res.status(400).json({ error: e.message });
      throw e;
    }
    const limit = Math.min(int(req.query.limit) ?? 20, 200);
    const offset = int(req.query.offset) ?? 0;
    res.json({
      total: matches.length,
      offset,
      limit,
      items: matches.slice(offset, offset + limit).map((f) => ({ ...f, severity: IMPACT_LABEL[f.impact_rank] })),
    });
  });

  app.get('/api/findings.csv', (req, res) => {
    let matches;
    try {
      matches = store.findFindings(readFindingFilters(req.query)).filter(compileSearch(req.query.search));
    } catch (e) {
      if (e instanceof SearchError) return res.status(400).json({ error: e.message });
      throw e;
    }
    const header = ['id', 'rule', 'problem', 'severity', 'type', 'status', 'url', 'selector', 'html', 'first_seen', 'last_seen'];
    const lines = [header.join(',')];
    for (const f of matches) {
      lines.push(
        [
          `F-${f.id}`, f.rule_id, f.rule_help, IMPACT_LABEL[f.impact_rank], f.kind, f.status,
          f.url, f.selector, f.html, f.first_seen_at, f.last_seen_at,
        ].map(csvCell).join(','),
      );
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="findings.csv"');
    res.send(`${lines.join('\r\n')}\r\n`);
  });

  app.get('/api/findings/:id', (req, res) => {
    const finding = findingDetail(store, int(req.params.id) ?? -1);
    if (!finding) return res.status(404).json({ error: 'Finding not found' });
    res.json(finding);
  });

  app.post('/api/findings/status', (req, res) => {
    const { ids, status, reason } = req.body || {};
    if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || !ids.every(Number.isInteger)) {
      return res.status(400).json({ error: 'ids must be a list of finding numbers' });
    }
    if (!oneOf(status, ['open', 'dismissed'])) return res.status(400).json({ error: 'status must be open or dismissed' });
    res.json({ changed: store.setFindingStatus(ids, status, reason ? String(reason).slice(0, 500) : null) });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 4310;
  const store = openStore(process.env.A11Y_DB || join(root, 'data', 'checker.db'));
  const interrupted = store.failInterrupted();
  if (interrupted) console.log(`Marked ${interrupted} interrupted scan(s) as failed.`);
  // Bound to loopback: the checker fetches any URL it is given, so it should not be reachable from the network.
  createApp(store, createQueue(store)).listen(port, '127.0.0.1', () => {
    console.log(`Accessibility checker running at http://localhost:${port}`);
  });
}
