// Stand-in for the live API when the checker is published as a static
// snapshot. Answers the same paths as src/server.js from data.json, and
// refuses anything that would change data.
import { compileSearch } from './search.js';

const csvCell = (value) => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheets from treating cells as formulas
  return `"${s.replace(/"/g, '""')}"`;
};

export function findingsCsv(items) {
  const header = ['id', 'rule', 'problem', 'severity', 'type', 'status', 'url', 'selector', 'html', 'first_seen', 'last_seen'];
  const lines = [header.join(',')];
  for (const f of items) {
    lines.push([`F-${f.id}`, f.rule_id, f.rule_help, f.severity, f.kind, f.status, f.url, f.selector, f.html, f.first_seen_at, f.last_seen_at].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Build the API from an already-loaded snapshot. Exported for tests. */
export function staticApiFrom(data) {
  const byId = new Map(data.findings.map((f) => [f.id, f]));
  const int = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);

  function overview(site) {
    const inSite = data.scans.filter((s) => !site || s.origin === site);
    const done = inSite.filter((s) => s.status === 'done').sort((a, b) => a.id - b.id).slice(-12);
    const trend = done.map((s) => ({ id: s.id, url: s.url, score: s.score, finished_at: s.finished_at, pages_scanned: s.pages_scanned, severity: data.details[s.id].severity }));
    const latest = trend.at(-1);
    const previous = trend.at(-2);
    return {
      sites: data.sites,
      latest: latest ? { ...data.scans.find((s) => s.id === latest.id), severity: latest.severity } : null,
      previous: previous ? { id: previous.id, score: previous.score, severity: previous.severity } : null,
      trend,
      recent: inSite.slice(0, 10),
    };
  }

  function findings(q) {
    const scanId = int(q.get('scan'));
    const pageId = int(q.get('page'));
    const kind = ['fail', 'review'].includes(q.get('kind')) ? q.get('kind') : null;
    let rows;
    if (scanId) {
      rows = (data.membership[scanId] || [])
        .filter(([, page, k]) => (!pageId || page === pageId) && (!kind || k === kind))
        .map(([id]) => byId.get(id))
        .filter(Boolean);
    } else {
      rows = data.findings.filter((f) => !kind || f.kind === kind);
    }
    const rule = q.get('rule');
    const status = q.get('status');
    const impact = int(q.get('impact'));
    const matches = compileSearch(q.get('search')); // throws SearchError with a readable message
    rows = rows
      .filter((f) => (!rule || f.rule_id === rule) && (!status || f.status === status) && (!impact || f.impact_rank === impact) && matches(f))
      .sort((a, b) => b.impact_rank - a.impact_rank || a.id - b.id);
    const limit = int(q.get('limit')) ?? 20;
    const offset = int(q.get('offset')) ?? 0;
    return { total: rows.length, offset, limit, items: rows.slice(offset, offset + limit) };
  }

  return async function api(path, { method = 'GET' } = {}) {
    if (method !== 'GET') throw new Error('This is a read-only snapshot. Run the checker on your own computer to scan pages or change findings.');
    const [route, qs = ''] = path.split('?');
    const q = new URLSearchParams(qs);
    if (route === '/api/config') return data.config;
    if (route === '/api/overview') return overview(q.get('site'));
    if (route === '/api/scans') return data.scans;
    if (route === '/api/findings') return findings(q);
    let m = /^\/api\/scans\/(\d+)$/.exec(route);
    if (m) {
      if (!data.details[m[1]]) throw new Error('Scan not found');
      return data.details[m[1]];
    }
    m = /^\/api\/findings\/(\d+)$/.exec(route);
    if (m) {
      const f = byId.get(Number(m[1]));
      if (!f) throw new Error('Finding not found');
      return f;
    }
    throw new Error('Not found');
  };
}

export async function createStaticApi() {
  const res = await fetch('data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load the snapshot data (${res.status})`);
  const data = await res.json();
  return { api: staticApiFrom(data), generatedAt: data.generated_at };
}
