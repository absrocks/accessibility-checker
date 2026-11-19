// The checker's API, independent of how requests arrive. The server calls it
// from Express (src/server.js); the published site calls it directly in the
// page (public/browser-api.js).
//
//   const handle = createApi({ store, queue, engine });
//   const { status, json, text } = await handle('GET', '/api/scans?site=...');
import { VIEWPORTS } from './engine.js';
import { IMPACT_LABEL } from './score.js';
import { SearchError, compileSearch } from './search.js';
import { parseTarget } from './urls.js';
import { MAX_PAGES, configView, describeScan, findingDetail, scanDetail } from './views.js';
import { STANDARDS } from './wcag.js';

const int = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
const oneOf = (v, allowed) => (allowed.includes(v) ? v : null);
const json = (status, body) => ({ status, json: body });
const fail = (status, message) => json(status, { error: message });

function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheets from treating cells as formulas
  return `"${s.replace(/"/g, '""')}"`;
}

/** Filters shared by the findings list and its CSV export. */
function readFindingFilters(query) {
  return {
    scanId: int(query.get('scan')),
    ruleId: query.get('rule') || null,
    pageId: int(query.get('page')),
    kind: oneOf(query.get('kind'), ['fail', 'review']),
    status: oneOf(query.get('status'), ['open', 'dismissed']),
    impact: int(query.get('impact')),
    sort: query.get('sort') || null,
  };
}

export function createApi({ store, queue, engine }) {
  function matchingFindings(query) {
    try {
      return store.findFindings(readFindingFilters(query)).filter(compileSearch(query.get('search')));
    } catch (e) {
      if (e instanceof SearchError) return fail(400, e.message);
      throw e;
    }
  }

  function createScan(body) {
    // Pages to check: a list in `urls`, or a single `url`.
    const given = Array.isArray(body.urls) ? body.urls : [body.url];
    const targets = [];
    for (const entry of given) {
      const target = parseTarget(entry);
      if (!target) {
        const shown = String(entry ?? '').slice(0, 80);
        return fail(400, `${shown ? `"${shown}" is not a full address. ` : ''}Enter full http or https addresses, for example https://example.com/`);
      }
      if (!targets.some((t) => t.href === target.href)) targets.push(target);
    }
    if (!targets.length) return fail(400, 'Enter at least one page address');
    // Total pages: the listed ones plus `extraPages` found by following links, or `maxPages` in all.
    const extra = int(body.extraPages);
    if (body.extraPages != null && extra === null) return fail(400, 'Extra pages must be a whole number');
    const maxPages = body.extraPages != null ? targets.length + extra : Math.max(int(body.maxPages) ?? targets.length, targets.length);
    if (maxPages < 1 || maxPages > MAX_PAGES) return fail(400, `A scan can cover at most ${MAX_PAGES} pages; this one asks for ${maxPages}`);
    const standard = body.standard ?? 'wcag22aa';
    if (!STANDARDS[standard]) return fail(400, 'Unknown standard');
    const viewport = body.viewport ?? 'both';
    if (!VIEWPORTS[viewport]) return fail(400, 'Unknown viewport');

    const scan = store.createScan({
      url: targets[0].href,
      origin: targets[0].origin,
      urls: targets.map((t) => t.href),
      standard,
      bestPractices: Boolean(body.bestPractices),
      viewport,
      maxPages,
      engine,
    });
    queue.enqueue(scan.id);
    return json(201, describeScan(scan));
  }

  return async function handle(method, target, body) {
    const [path, qs = ''] = String(target).split('?');
    const query = new URLSearchParams(qs);
    const site = query.get('site') || null;
    const route = `${method} ${path}`;

    if (route === 'GET /api/config') return json(200, configView(engine));

    if (route === 'GET /api/overview') {
      const trend = store.trend(site);
      const latest = trend.at(-1) || null;
      const previous = trend.at(-2) || null;
      return json(200, {
        sites: store.listSites(),
        latest: latest && { ...describeScan(store.getScan(latest.id)), severity: latest.severity },
        previous: previous && { id: previous.id, score: previous.score, severity: previous.severity },
        trend,
        recent: store.listScans(site).slice(0, 10).map(describeScan),
      });
    }

    if (route === 'GET /api/scans') return json(200, store.listScans(site).map(describeScan));
    if (route === 'POST /api/scans') return createScan(body || {});

    if (route === 'GET /api/findings') {
      const matches = matchingFindings(query);
      if (!Array.isArray(matches)) return matches;
      const limit = Math.min(int(query.get('limit')) ?? 20, 200);
      const offset = int(query.get('offset')) ?? 0;
      return json(200, {
        total: matches.length,
        offset,
        limit,
        items: matches.slice(offset, offset + limit).map((f) => ({ ...f, severity: IMPACT_LABEL[f.impact_rank] })),
      });
    }

    if (route === 'GET /api/findings.csv') {
      const matches = matchingFindings(query);
      if (!Array.isArray(matches)) return matches;
      const header = ['id', 'rule', 'problem', 'severity', 'type', 'status', 'url', 'selector', 'html', 'first_seen', 'last_seen'];
      const lines = [header.join(',')];
      for (const f of matches) {
        lines.push(
          [`F-${f.id}`, f.rule_id, f.rule_help, IMPACT_LABEL[f.impact_rank], f.kind, f.status, f.url, f.selector, f.html, f.first_seen_at, f.last_seen_at]
            .map(csvCell).join(','),
        );
      }
      return { status: 200, text: `${lines.join('\r\n')}\r\n`, type: 'text/csv; charset=utf-8', filename: 'findings.csv' };
    }

    if (route === 'POST /api/findings/status') {
      const { ids, status, reason } = body || {};
      if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || !ids.every(Number.isInteger)) {
        return fail(400, 'ids must be a list of finding numbers');
      }
      if (!oneOf(status, ['open', 'dismissed'])) return fail(400, 'status must be open or dismissed');
      return json(200, { changed: store.setFindingStatus(ids, status, reason ? String(reason).slice(0, 500) : null) });
    }

    let m = /^\/api\/findings\/(\d+)$/.exec(path);
    if (m && method === 'GET') {
      const finding = findingDetail(store, Number(m[1]));
      return finding ? json(200, finding) : fail(404, 'Finding not found');
    }

    m = /^\/api\/scans\/(\d+)(\/rerun)?$/.exec(path);
    if (m) {
      const scan = store.getScan(Number(m[1]));
      if (!scan) return fail(404, 'Scan not found');
      if (method === 'GET' && !m[2]) return json(200, scanDetail(store, scan));
      if (method === 'DELETE' && !m[2]) {
        if (queue.isBusy(scan.id)) return fail(409, 'This scan is still running');
        store.deleteScan(scan.id);
        return { status: 204 };
      }
      if (method === 'POST' && m[2]) {
        const again = store.createScan({
          url: scan.url,
          origin: scan.origin,
          urls: scan.urls ? JSON.parse(scan.urls) : [scan.url],
          standard: scan.standard,
          bestPractices: scan.best_practices,
          viewport: scan.viewport,
          maxPages: scan.max_pages,
          engine,
        });
        queue.enqueue(again.id);
        return json(201, describeScan(again));
      }
    }

    return fail(404, 'Not found');
  };
}
