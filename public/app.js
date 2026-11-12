// Accessibility Checker front end. No build step: plain modules and DOM calls.
// Scan results contain markup from scanned pages, so everything is inserted
// as text nodes, never as HTML.

const main = document.getElementById('main');
const statusRegion = document.getElementById('status');
const dialog = document.getElementById('finding-dialog');
const dialogBody = document.getElementById('finding-body');

const SEVERITY = ['Unknown', 'Minor', 'Moderate', 'Serious', 'Critical'];
const SVG_NS = 'http://www.w3.org/2000/svg';
let config = { standards: [], viewports: [], maxPages: 50, engine: '' };
let stopView = null; // cancels the current view's polling

// The published copy has no server behind it. Its index.html is marked, and
// the API then runs inside the page (browser-api.js) instead of over HTTP.
const HOSTED = document.querySelector('meta[name="checker-mode"]')?.content === 'static';
let hosted = null; // set at startup when HOSTED: published date, local-change state, reset()

// ---------------------------------------------------------------- helpers

function build(el, attrs, kids) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.setAttribute('class', value);
    else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const h = (tag, attrs, ...kids) => build(document.createElement(tag), attrs, kids);
const s = (tag, attrs, ...kids) => build(document.createElementNS(SVG_NS, tag), attrs, kids);

async function liveApi(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let api = liveApi;

function announce(message) {
  statusRegion.textContent = '';
  requestAnimationFrame(() => { statusRegion.textContent = message; });
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

function band(score) {
  if (score == null) return { cls: '', label: 'No score' };
  if (score >= 85) return { cls: 'band-good', label: 'Good' };
  if (score >= 60) return { cls: 'band-fair', label: 'Fair' };
  return { cls: 'band-poor', label: 'Poor' };
}

const severityBadge = (rank) => h('span', { class: `badge sev-${rank}` }, SEVERITY[rank] || 'Unknown');
const statusBadge = (status) => h('span', { class: `badge st-${status}` }, status[0].toUpperCase() + status.slice(1));

function scoreText(score) {
  const b = band(score);
  return score == null ? h('span', {}, '—') : h('span', { class: b.cls }, h('strong', {}, score), ` ${b.label}`);
}

function scoreRing(score) {
  const b = band(score);
  const r = 46;
  const c = 2 * Math.PI * r;
  const filled = score == null ? 0 : (score / 100) * c;
  return s('svg', { class: b.cls, width: 116, height: 116, viewBox: '0 0 116 116', role: 'img', 'aria-label': score == null ? 'No score yet' : `Score ${score} out of 100, ${b.label}` },
    s('circle', { class: 'ring-bg', cx: 58, cy: 58, r, fill: 'none', 'stroke-width': 10 }),
    s('circle', { class: 'ring', cx: 58, cy: 58, r, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': `${filled} ${c - filled}`, transform: 'rotate(-90 58 58)' }),
    s('text', { x: 58, y: 68, 'text-anchor': 'middle' }, score == null ? '—' : score));
}

function severityBars(counts) {
  const max = Math.max(1, ...counts.slice(1));
  return h('dl', { class: 'bars' }, [4, 3, 2, 1].map((rank) => [
    h('dt', {}, SEVERITY[rank]),
    h('div', { class: `track sev-${rank}`, 'aria-hidden': 'true' }, h('div', { class: 'fill', style: `width:${(counts[rank] / max) * 100}%` })),
    h('dd', {}, counts[rank]),
  ]));
}

function table(caption, headers, rows, emptyText) {
  if (!rows.length) return h('p', { class: 'empty' }, emptyText || 'Nothing to show.');
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('caption', { class: caption.hidden ? 'visually-hidden' : null }, caption.text || caption),
      h('thead', {}, h('tr', {}, headers.map((hd) => h('th', { scope: 'col', class: hd.num ? 'num' : null }, hd.label ?? hd)))),
      h('tbody', {}, rows)));
}

function crumbs(items) {
  return h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
    h('ol', {}, items.map(([label, href]) => h('li', {}, href ? h('a', { href }, label) : h('span', { 'aria-current': 'page' }, label)))));
}

function page(title, ...content) {
  document.title = `${title} · Accessibility Checker`;
  main.replaceChildren(...content.flat(Infinity).filter(Boolean));
}

/** Re-run `fn` every few seconds until it returns false or the view changes. */
function poll(fn, ms = 2500) {
  let timer;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    let again = false;
    try { again = await fn(); } catch { again = true; }
    if (again && !stopped) timer = setTimeout(tick, ms);
  };
  timer = setTimeout(tick, ms);
  stopView = () => { stopped = true; clearTimeout(timer); };
}

async function rerun(scanId) {
  const scan = await api(`/api/scans/${scanId}/rerun`, { method: 'POST' });
  announce('Scan started');
  location.hash = `#/scans/${scan.id}`;
}

// --------------------------------------------------------------- overview

async function viewOverview(_m, query) {
  const site = query.get('site') || '';
  const data = await api(`/api/overview${site ? `?site=${encodeURIComponent(site)}` : ''}`);
  const head = [
    h('h1', {}, 'Overview'),
    h('p', { class: 'lede' }, HOSTED
      ? `Results published ${fmtDate(hosted.publishedAt)}${hosted.hasLocalChanges() ? ', with changes made in this browser' : ''}.`
      : 'Accessibility health across your finished scans.'),
  ];
  if (data.sites.length > 1) {
    head.push(h('div', { class: 'toolbar' }, h('div', {},
      h('label', { for: 'site' }, 'Site'),
      h('select', { id: 'site', onchange: (e) => { location.hash = e.target.value ? `#/?site=${encodeURIComponent(e.target.value)}` : '#/'; } },
        h('option', { value: '' }, 'All sites'),
        data.sites.map((o) => h('option', { value: o, selected: o === site }, o))))));
  }
  if (!data.latest) {
    return page('Overview', head, h('div', { class: 'card empty' },
      h('p', {}, 'No finished scans yet.'), h('a', { class: 'button', href: '#/scans' }, 'Run your first scan')));
  }

  const { latest, previous, trend } = data;
  const delta = previous && latest.score != null && previous.score != null ? latest.score - previous.score : null;
  const totalOpen = latest.severity.reduce((a, b) => a + b, 0);

  const scoreCard = h('section', { class: 'card' },
    h('h2', {}, 'Latest score'),
    h('div', { class: 'score' }, scoreRing(latest.score), h('div', {},
      h('p', {}, h('strong', {}, band(latest.score).label)),
      h('p', { class: 'delta' }, delta == null ? 'No earlier scan to compare with.'
        : delta === 0 ? `Unchanged since the previous scan (${previous.score}).`
        : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} since the previous scan (${previous.score}).`),
      h('p', {}, h('a', { href: `#/scans/${latest.id}` }, 'View latest scan')))));

  const sevCard = h('section', { class: 'card' },
    h('h2', {}, `Open failed findings (${totalOpen})`), severityBars(latest.severity));

  return page('Overview', head,
    h('div', { class: 'grid' }, scoreCard, sevCard),
    h('section', { class: 'card' }, h('h2', {}, 'Score over time'), trendChart(trend)),
    h('section', { class: 'card' }, h('h2', {}, 'Recent scans'), scansTable(data.recent, { compact: true })));
}

function trendChart(trend) {
  if (trend.length < 2) return h('p', { class: 'empty' }, 'The trend appears after two finished scans.');
  const W = 720, H = 200, padL = 34, padR = 12, padT = 12, padB = 26;
  const x = (i) => padL + (i * (W - padL - padR)) / (trend.length - 1);
  const y = (v) => padT + ((100 - v) * (H - padT - padB)) / 100;
  const pts = trend.filter((t) => t.score != null).map((t) => [x(trend.indexOf(t)), y(t.score)]);
  return [
    s('svg', { class: 'trend', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Score for the last ${trend.length} scans, from ${trend[0].score} to ${trend.at(-1).score}. The table below has the values.` },
      [0, 50, 100].map((v) => [
        s('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(v), y2: y(v) }),
        s('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end' }, v),
      ]),
      s('polyline', { class: 'line', points: pts.map((p) => p.join(',')).join(' ') }),
      pts.map(([px, py]) => s('circle', { cx: px, cy: py, r: 4 })),
      trend.map((t, i) => (i === 0 || i === trend.length - 1 || trend.length <= 6
        ? s('text', { x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === trend.length - 1 ? 'end' : 'middle' }, fmtDay(t.finished_at)) : null))),
    h('details', {}, h('summary', {}, 'Show trend as a table'),
      table({ text: 'Score and open failed findings per scan', hidden: true },
        ['Finished', 'Scan', { label: 'Score', num: true }, { label: 'Critical', num: true }, { label: 'Serious', num: true }, { label: 'Moderate', num: true }, { label: 'Minor', num: true }],
        trend.map((t) => h('tr', {},
          h('td', {}, fmtDate(t.finished_at)), h('td', { class: 'wrap' }, h('a', { href: `#/scans/${t.id}` }, t.url)),
          h('td', { class: 'num' }, t.score ?? '—'),
          [4, 3, 2, 1].map((r) => h('td', { class: 'num' }, t.severity[r])))))),
  ];
}

// ------------------------------------------------------------------ scans

function scansTable(scans, { compact = false, onChange } = {}) {
  return table({ text: 'Scans', hidden: true },
    ['Started', 'Address', compact ? null : 'Standard', { label: 'Pages', num: true }, 'Status', 'Score', { label: 'Failed findings', num: true }, 'Actions'].filter(Boolean),
    scans.map((sc) => h('tr', {},
      h('td', {}, fmtDate(sc.created_at)),
      h('td', { class: 'wrap' }, h('a', { href: `#/scans/${sc.id}` }, sc.url),
        sc.pages_listed.length > 1 ? h('span', { class: 'delta' }, ` and ${sc.pages_listed.length - 1} more listed page${sc.pages_listed.length === 2 ? '' : 's'}`) : null),
      compact ? null : h('td', {}, sc.standard_label),
      h('td', { class: 'num' }, `${sc.pages_scanned} of ${sc.max_pages}`),
      h('td', {}, statusBadge(sc.status)),
      h('td', {}, scoreText(sc.score)),
      h('td', { class: 'num' }, sc.status === 'done' ? sc.fail_count : '—'),
      h('td', {},
        h('button', { class: 'link', 'aria-label': `Re-run scan of ${sc.url}`, onclick: () => rerun(sc.id).catch((e) => announce(e.message)) }, 'Re-run'),
        compact ? null : removeButton(sc, onChange)))),
    'No scans yet.');
}

/**
 * A button for something that cannot be undone. The first press only arms
 * it; a second press within a few seconds does it. Moving away disarms it.
 */
function twoStepButton({ label, armedLabel, name, warning, action, cls = 'link' }) {
  let armed = false;
  let timer;
  const button = h('button', { class: cls, type: 'button', 'aria-label': `${label} ${name}` }, label);
  const disarm = () => {
    armed = false;
    clearTimeout(timer);
    button.textContent = label;
    button.setAttribute('aria-label', `${label} ${name}`);
    button.classList.remove('danger');
  };
  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.textContent = armedLabel;
      button.setAttribute('aria-label', `${armedLabel}: ${name}`);
      button.classList.add('danger');
      announce(warning);
      timer = setTimeout(disarm, 6000);
      return;
    }
    disarm();
    try {
      await action();
    } catch (e) {
      announce(e.message);
    }
  });
  button.addEventListener('blur', disarm);
  return button;
}

const removeButton = (sc, onChange) => twoStepButton({
  label: 'Remove',
  armedLabel: 'Confirm remove',
  name: `scan of ${sc.url} from ${fmtDate(sc.created_at)}`,
  warning: 'Press again to remove this scan and its results. This cannot be undone.',
  action: async () => {
    await api(`/api/scans/${sc.id}`, { method: 'DELETE' });
    announce('Scan removed');
    onChange?.();
  },
});

/** Explains, on the published copy, where scans run and where changes are kept. */
function hostedNotice() {
  return h('section', { class: 'card notice', 'aria-label': 'About scanning on this page' },
    h('p', {}, h('strong', {}, 'Scans here run in your browser. '),
      `They can read pages on this address (${location.origin}/…) and on other sites that allow it. A site that does not allow it cannot be scanned from here; use the checker on your own computer for that. Pages are checked without running their own scripts.`),
    h('p', {}, hosted.canSave()
      ? 'Scans you run, and anything you remove or dismiss, are saved in this browser only.'
      : 'This browser is not letting the page save data, so your changes last only until you close or reload it.',
      hosted.publishedIsNewer() ? ' The published results have been updated since your copy was made.' : ''),
    hosted.hasLocalChanges() ? twoStepButton({
      label: 'Reset to published results',
      armedLabel: 'Confirm reset',
      name: '(discards the scans and changes saved in this browser)',
      warning: 'Press again to discard the scans and changes saved in this browser.',
      action: () => hosted.reset(),
      cls: '',
    }) : null);
}

async function viewScans() {
  const error = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { class: 'card', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      const f = new FormData(form);
      const urls = String(f.get('urls') || '').split(/\s+/).filter(Boolean);
      try {
        const scan = await api('/api/scans', { method: 'POST', body: {
          urls, extraPages: Number(f.get('extraPages') || 0), standard: f.get('standard'),
          viewport: f.get('viewport'), bestPractices: f.get('bestPractices') === 'on',
        } });
        announce('Scan started');
        location.hash = `#/scans/${scan.id}`;
      } catch (err) {
        error.textContent = err.message;
        form.querySelector('#urls').focus();
      }
    } },
    h('h2', {}, 'Run a scan'),
    h('div', { class: 'row' },
      h('div', { class: 'wide' }, h('label', { for: 'urls' }, 'Pages to scan, one address per line'),
        h('textarea', { id: 'urls', name: 'urls', rows: 4, required: true, spellcheck: 'false', placeholder: HOSTED ? `${location.origin}/your-site/\n${location.origin}/your-site/about/` : 'https://example.com/\nhttps://example.com/about/', 'aria-describedby': 'pages-hint' })),
      h('div', {}, h('label', { for: 'extraPages' }, 'More pages found by following links'),
        h('input', { id: 'extraPages', name: 'extraPages', type: 'number', min: 0, max: config.maxPages - 1, value: 0, 'aria-describedby': 'pages-hint' })),
      h('div', {}, h('label', { for: 'standard' }, 'Standard'),
        h('select', { id: 'standard', name: 'standard' }, config.standards.map((st) => h('option', { value: st.id, selected: st.id === 'wcag22aa' }, st.label)))),
      h('div', {}, h('label', { for: 'viewport' }, 'Viewport'),
        h('select', { id: 'viewport', name: 'viewport' }, config.viewports.map((v) => h('option', { value: v.id }, v.label)))),
      h('div', { class: 'check' }, h('input', { id: 'bestPractices', name: 'bestPractices', type: 'checkbox' }), h('label', { for: 'bestPractices' }, 'Include best practices')),
      h('button', { class: 'primary', type: 'submit' }, 'Run scan')),
    h('p', { id: 'pages-hint', class: 'delta' }, `Every page you list is checked, and the scan's score is the average of their scores. To cover more of a site, the checker can also follow links from the first page, on the same site. A scan can cover up to ${config.maxPages} pages in all.`),
    error);

  const list = h('section', { class: 'card' });
  const refresh = async () => {
    const scans = await api('/api/scans');
    list.replaceChildren(h('h2', {}, `All scans (${scans.length})`), scansTable(scans, { onChange: refresh }));
    return scans.some((sc) => sc.status === 'queued' || sc.status === 'running');
  };
  page('Scans', h('h1', {}, 'Scans'),
    h('p', { class: 'lede' }, 'Add the pages you want checked. Each scan gets a score from the pages in it; remove a scan to discard its results.'),
    HOSTED ? hostedNotice() : null, form, list);
  if (await refresh()) poll(refresh);
}

// ------------------------------------------------------------ scan detail

async function viewScan([id], query) {
  const data = await api(`/api/scans/${id}`);
  const { scan } = data;
  const head = [
    crumbs([['Scans', '#/scans'], ['Scan results']]),
    h('div', { class: 'spread' }, h('h1', {}, 'Scan results'),
      h('button', { onclick: () => rerun(scan.id).catch((e) => announce(e.message)) }, 'Re-run scan')),
    h('p', { class: 'lede' }, scan.url, scan.pages_listed.length > 1 ? ` and ${scan.pages_listed.length - 1} more listed page${scan.pages_listed.length === 2 ? '' : 's'}` : ''),
    h('ul', { class: 'meta' },
      h('li', {}, statusBadge(scan.status)),
      h('li', {}, fmtDate(scan.started_at || scan.created_at)),
      h('li', {}, scan.standard_label + (scan.best_practices ? ' + best practices' : '')),
      h('li', {}, scan.viewport_label),
      h('li', {}, `${scan.pages_scanned} of ${scan.max_pages} pages`),
      h('li', {}, scan.engine)),
  ];

  if (scan.status === 'queued' || scan.status === 'running') {
    page('Scan results', head, h('div', { class: 'card', role: 'status' },
      h('p', {}, h('span', { class: 'spin', 'aria-hidden': 'true' }, '◌'), ' ',
        scan.status === 'queued' ? 'Waiting for another scan to finish…' : `Scanning… ${scan.pages_scanned} of up to ${scan.max_pages} pages done.`)));
    poll(async () => {
      const next = await api(`/api/scans/${id}`);
      if (next.scan.status === 'queued' || next.scan.status === 'running') {
        if (next.scan.status !== scan.status || next.scan.pages_scanned !== scan.pages_scanned) route(false);
        return true;
      }
      announce(next.scan.status === 'done' ? 'Scan finished' : 'Scan failed');
      route(false);
      return false;
    });
    return;
  }
  if (scan.status === 'failed') {
    return page('Scan results', head, h('div', { class: 'card' }, h('h2', {}, 'This scan failed'), h('p', { class: 'error' }, scan.error || 'Unknown error')));
  }

  const totalOpen = data.severity.reduce((a, b) => a + b, 0);
  const summary = h('div', { class: 'grid' },
    h('section', { class: 'card' }, h('h2', {}, 'Score'), h('div', { class: 'score' }, scoreRing(scan.score),
      h('p', {}, h('strong', {}, band(scan.score).label), h('br'), h('span', { class: 'delta' }, 'Weighted share of the rules checked that passed. A failing rule costs more the more severe it is and the more elements fail it. Best-practice rules do not count.')))),
    h('section', { class: 'card' }, h('h2', {}, `Open failed findings (${totalOpen})`), severityBars(data.severity)),
    h('section', { class: 'card' }, h('h2', {}, 'Rules'),
      h('dl', { class: 'stats' },
        h('div', {}, h('dt', {}, 'Failed'), h('dd', {}, data.counts.fail)),
        h('div', {}, h('dt', {}, 'Needs review'), h('dd', {}, data.counts.review)),
        h('div', {}, h('dt', {}, 'Passed'), h('dd', {}, data.counts.pass)))));

  const levels = h('section', { class: 'card' }, h('h2', {}, 'Findings by conformance level'),
    table({ text: 'Rules evaluated and open failed findings by level', hidden: true },
      ['Level', { label: 'Rules evaluated', num: true }, { label: 'Open failed findings', num: true }],
      data.levels.map((l) => h('tr', {}, h('td', {}, l.level === 'Best practice' ? l.level : `WCAG Level ${l.level}`), h('td', { class: 'num' }, l.rules_evaluated), h('td', { class: 'num' }, l.findings)))));

  const tab = query.get('view') === 'pages' ? 'pages' : 'rules';
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Group results' },
    [['rules', 'By rule'], ['pages', `By page (${data.pages.length})`]].map(([key, label]) =>
      h('button', { role: 'tab', 'aria-selected': String(tab === key), onclick: () => { location.hash = `#/scans/${id}?view=${key}`; } }, label)));

  const ruleRows = (rules) => rules.map((r) => h('tr', {},
    h('td', {}, h('a', { href: `#/scans/${id}/findings?rule=${encodeURIComponent(r.rule_id)}` }, r.help || r.rule_id), r.custom ? h('span', { class: 'delta' }, ' (custom rule)') : null),
    h('td', {}, r.criteria.length ? r.criteria.map((c, i) => [i ? ', ' : '', `${c.num} ${c.name || ''} (${c.level || '?'})`]) : 'Best practice'),
    h('td', {}, severityBadge(r.impact_rank)),
    h('td', { class: 'num' }, r.pages_affected),
    h('td', { class: 'num' }, r.open),
    h('td', { class: 'num' }, r.dismissed)));
  const ruleHeaders = ['Rule', 'Criterion', 'Severity', { label: 'Pages', num: true }, { label: 'Open', num: true }, { label: 'Dismissed', num: true }];
  const of = (outcome) => data.rules.filter((r) => r.outcome === outcome);

  const body = tab === 'rules'
    ? [
      h('h2', {}, `Failed (${data.counts.fail})`),
      table({ text: 'Rules that failed', hidden: true }, ruleHeaders, ruleRows(of('fail')), 'No rules failed.'),
      h('h2', { style: 'margin-top:24px' }, `Needs review (${data.counts.review})`),
      h('p', { class: 'delta' }, 'The checker could not decide these automatically. Look at each one and dismiss it if it does not apply.'),
      table({ text: 'Rules that need manual review', hidden: true }, ruleHeaders, ruleRows(of('review')), 'Nothing needs review.'),
      h('details', { style: 'margin-top:24px' }, h('summary', {}, `Passed rules (${data.counts.pass})`),
        table({ text: 'Rules that passed', hidden: true }, ['Rule', 'Criterion'],
          of('pass').map((r) => h('tr', {}, h('td', {}, r.help || r.rule_id),
            h('td', {}, r.criteria.length ? r.criteria.map((c) => c.num).join(', ') : 'Best practice'))), 'No rules passed.')),
    ]
    : table({ text: 'Pages in this scan', hidden: true },
      ['Page', 'Score', { label: 'Failed', num: true }, { label: 'Needs review', num: true }],
      data.pages.map((p) => h('tr', {},
        h('td', { class: 'wrap' }, p.error ? [p.url, h('br'), h('span', { class: 'error' }, `Could not scan: ${p.error}`)]
          : [h('a', { href: `#/scans/${id}/findings?page=${p.id}` }, p.title || p.url), h('br'), h('span', { class: 'delta' }, p.url)]),
        h('td', {}, scoreText(p.score)), h('td', { class: 'num' }, p.error ? '—' : p.fail_count), h('td', { class: 'num' }, p.error ? '—' : p.review_count))));

  page('Scan results', head, summary, levels, h('section', { class: 'card' }, tabs, h('div', { role: 'tabpanel' }, body)));
}

// --------------------------------------------------------------- findings

const SEARCH_FIELDS = [['html', 'Code snippet'], ['selector', 'CSS selector'], ['url', 'Page address'], ['title', 'Page title']];
const SEARCH_OPS = [['contains', 'contains'], ['not_contains', 'does not contain'], ['starts_with', 'starts with'], ['ends_with', 'ends with'], ['regex', 'matches regex']];

async function viewFindings([scanId], query) {
  const ruleId = query.get('rule');
  const pageId = query.get('page');
  const state = { status: '', impact: '', kind: scanId || ruleId ? '' : 'fail', clauses: [], offset: 0, limit: 20, selected: new Set(), items: [], total: 0 };

  let title = 'Findings';
  const head = [];
  if (scanId) {
    const data = await api(`/api/scans/${scanId}`);
    const rule = ruleId && data.rules.find((r) => r.rule_id === ruleId);
    const pg = pageId && data.pages.find((p) => String(p.id) === pageId);
    title = rule ? rule.help || ruleId : pg ? pg.title || pg.url : 'Findings in this scan';
    head.push(crumbs([['Scans', '#/scans'], ['Scan results', `#/scans/${scanId}`], ['Findings']]), h('h1', {}, title));
    if (rule) {
      head.push(h('p', { class: 'lede' }, rule.description),
        h('ul', { class: 'meta' },
          h('li', {}, severityBadge(rule.impact_rank)),
          h('li', {}, 'Rule ', h('code', {}, rule.rule_id), rule.custom ? ' (custom rule, not part of axe-core)' : ''),
          rule.criteria.map((c) => h('li', {}, h('a', { href: c.url, target: '_blank', rel: 'noopener' }, `${c.num} ${c.name || ''} (Level ${c.level || '?'})`, h('span', { class: 'visually-hidden' }, ' (opens in a new tab)')))),
          rule.help_url ? h('li', {}, h('a', { href: rule.help_url, target: '_blank', rel: 'noopener' }, 'How to fix this rule', h('span', { class: 'visually-hidden' }, ' (opens in a new tab)'))) : null));
    } else if (pg) head.push(h('p', { class: 'lede' }, pg.url));
  } else {
    head.push(h('h1', {}, 'Findings'), h('p', { class: 'lede' }, 'Every finding recorded so far, in its current state. Open a scan to see only what that scan found.'));
  }

  const params = () => {
    const p = new URLSearchParams();
    if (scanId) p.set('scan', scanId);
    if (ruleId) p.set('rule', ruleId);
    if (pageId) p.set('page', pageId);
    for (const key of ['status', 'impact', 'kind']) if (state[key]) p.set(key, state[key]);
    if (state.clauses.length) p.set('search', JSON.stringify(state.clauses));
    return p;
  };

  const results = h('div', {});
  const chips = h('ul', { class: 'chips', 'aria-label': 'Active search filters' });
  const searchError = h('p', { class: 'error', role: 'alert' });

  const load = async (message) => {
    const p = params();
    p.set('offset', state.offset);
    p.set('limit', state.limit);
    let data;
    try {
      data = await api(`/api/findings?${p}`);
      searchError.textContent = '';
    } catch (e) {
      searchError.textContent = e.message;
      return;
    }
    state.items = data.items;
    state.total = data.total;
    render();
    announce(message || `${data.total} finding${data.total === 1 ? '' : 's'}`);
  };

  const setStatus = async (ids, status, reason) => {
    const { changed } = await api('/api/findings/status', { method: 'POST', body: { ids, status, reason } });
    state.selected.clear();
    await load(`${changed} finding${changed === 1 ? '' : 's'} ${status === 'dismissed' ? 'dismissed' : 'restored'}`);
  };

  const filterChanged = () => { state.offset = 0; state.selected.clear(); load(); };

  // The published copy has no server to send a file, so hand the CSV over as a download here.
  const downloadCsv = async () => {
    const text = await api(`/api/findings.csv?${params()}`);
    const link = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: 'findings.csv' });
    link.click();
    URL.revokeObjectURL(link.href);
    announce('Downloaded findings.csv');
  };

  function renderChips() {
    chips.replaceChildren(...state.clauses.map((c, i) => h('li', {},
      `${SEARCH_FIELDS.find((f) => f[0] === c.field)[1]} ${SEARCH_OPS.find((o) => o[0] === c.op)[1]} “${c.value}”`,
      h('button', { type: 'button', 'aria-label': `Remove filter ${i + 1}`, onclick: () => { state.clauses.splice(i, 1); renderChips(); filterChanged(); } }, '×'))));
  }

  const searchForm = h('form', { class: 'toolbar', 'aria-label': 'Advanced search',
    onsubmit: (e) => {
      e.preventDefault();
      const f = new FormData(searchForm);
      const value = String(f.get('value') || '').trim();
      if (!value) return;
      state.clauses.push({ field: f.get('field'), op: f.get('op'), value });
      searchForm.querySelector('#s-value').value = '';
      renderChips();
      filterChanged();
    } },
    h('div', {}, h('label', { for: 's-field' }, 'Search in'), h('select', { id: 's-field', name: 'field' }, SEARCH_FIELDS.map(([v, l]) => h('option', { value: v }, l)))),
    h('div', {}, h('label', { for: 's-op' }, 'Operation'), h('select', { id: 's-op', name: 'op' }, SEARCH_OPS.map(([v, l]) => h('option', { value: v }, l)))),
    h('div', {}, h('label', { for: 's-value' }, 'Search text'), h('input', { id: 's-value', name: 'value', type: 'text' })),
    h('button', { type: 'submit' }, 'Add filter'),
    h('button', { type: 'button', onclick: () => { state.clauses = []; renderChips(); filterChanged(); } }, 'Reset'));

  const select = (id, label, options, key) => h('div', {}, h('label', { for: id }, label),
    h('select', { id, onchange: (e) => { state[key] = e.target.value; filterChanged(); } },
      options.map(([v, l]) => h('option', { value: v, selected: state[key] === v }, l))));

  const filters = h('div', { class: 'toolbar' },
    select('f-status', 'Status', [['', 'All'], ['open', 'Open'], ['dismissed', 'Dismissed']], 'status'),
    ruleId ? null : select('f-impact', 'Severity', [['', 'All'], ['4', 'Critical'], ['3', 'Serious'], ['2', 'Moderate'], ['1', 'Minor']], 'impact'),
    ruleId ? null : select('f-kind', 'Type', [['', 'All'], ['fail', 'Failed'], ['review', 'Needs review']], 'kind'));

  function render() {
    const ids = state.items.map((f) => f.id);
    const allSelected = ids.length > 0 && ids.every((i) => state.selected.has(i));
    const chosen = [...state.selected];
    const actions = h('div', { class: 'toolbar' },
      h('button', { disabled: !chosen.length, onclick: () => setStatus(chosen, 'dismissed').catch((e) => announce(e.message)) }, `Dismiss selected (${chosen.length})`),
      h('button', { disabled: !chosen.length, onclick: () => setStatus(chosen, 'open').catch((e) => announce(e.message)) }, `Restore selected (${chosen.length})`),
      HOSTED
        ? h('button', { class: 'grow', onclick: () => downloadCsv().catch((e) => announce(e.message)) }, 'Download CSV')
        : h('a', { class: 'button grow', href: `api/findings.csv?${params()}`, download: 'findings.csv' }, 'Download CSV'));

    const rows = state.items.map((f, index) => h('tr', {},
      h('td', {}, h('input', { type: 'checkbox', checked: state.selected.has(f.id), 'aria-label': `Select finding F-${f.id}`,
        onchange: (e) => { if (e.target.checked) state.selected.add(f.id); else state.selected.delete(f.id); render(); } })),
      h('td', {}, `F-${f.id}`),
      ruleId ? null : h('td', {}, f.rule_help || f.rule_id, f.kind === 'review' ? h('span', { class: 'delta' }, ' (needs review)') : null),
      h('td', { class: 'wrap' }, f.url),
      h('td', { class: 'wrap' }, h('code', {}, f.selector)),
      h('td', {}, severityBadge(f.impact_rank)),
      h('td', {}, statusBadge(f.status)),
      h('td', {}, h('button', { class: 'link', 'aria-label': `View finding F-${f.id}`, onclick: (e) => openFinding(index, e.currentTarget) }, 'View'))));

    const start = state.total ? state.offset + 1 : 0;
    const end = Math.min(state.offset + state.limit, state.total);
    results.replaceChildren(actions,
      table({ text: `${state.total} finding${state.total === 1 ? '' : 's'}` },
        [h('input', { type: 'checkbox', checked: allSelected, 'aria-label': 'Select all findings on this page',
          onchange: (e) => { for (const i of ids) { if (e.target.checked) state.selected.add(i); else state.selected.delete(i); } render(); } }),
        'ID', ruleId ? null : 'Problem', 'Page', 'Element', 'Severity', 'Status', 'Actions'].filter((x) => x != null),
        rows, 'No findings match these filters.'),
      h('div', { class: 'pager' },
        h('label', { for: 'page-size', style: 'margin:0' }, 'Per page'),
        h('select', { id: 'page-size', onchange: (e) => { state.limit = Number(e.target.value); state.offset = 0; load(); } },
          [20, 50, 100].map((n) => h('option', { value: n, selected: n === state.limit }, n))),
        h('span', {}, `${start}–${end} of ${state.total}`),
        h('button', { disabled: state.offset === 0, onclick: () => { state.offset = Math.max(0, state.offset - state.limit); load(); } }, 'Previous'),
        h('button', { disabled: end >= state.total, onclick: () => { state.offset += state.limit; load(); } }, 'Next')));
  }

  // ---- finding detail dialog ----
  let opener = null;
  async function openFinding(index, trigger) {
    if (trigger) opener = trigger;
    const row = state.items[index];
    if (!row) return;
    const f = await api(`/api/findings/${row.id}`);
    const reason = h('input', { id: 'dismiss-reason', type: 'text', value: f.dismiss_reason || '' });
    const newTab = () => h('span', { class: 'visually-hidden' }, ' (opens in a new tab)');
    dialogBody.replaceChildren(
      h('div', { class: 'dlg-head' },
        h('h2', { id: 'finding-title' }, `Finding F-${f.id}`),
        h('button', { onclick: () => dialog.close() }, 'Close')),
      h('div', { class: 'dlg-body' },
        h('div', {},
          h('section', {}, h('h3', {}, 'Problem'), h('p', {}, f.rule_help || f.rule_id)),
          h('section', {}, h('h3', {}, 'Where'), h('p', {}, f.page_title ? `${f.page_title} — ` : '', h('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.url, newTab()))),
          h('section', {}, h('h3', {}, 'Element'), h('p', {}, h('code', {}, f.selector)), h('pre', {}, f.html)),
          f.summary ? h('section', {}, h('h3', {}, f.kind === 'review' ? 'What to check' : 'What is wrong'), h('pre', {}, f.summary)) : null,
          h('section', {}, h('h3', {}, 'About this rule'), h('p', {}, f.rule_description || ''),
            f.rule_help_url ? h('p', {}, h('a', { href: f.rule_help_url, target: '_blank', rel: 'noopener' }, 'How to fix it', newTab())) : null)),
        h('aside', { 'aria-label': 'Finding details' }, h('dl', {},
          h('dt', {}, 'Status'), h('dd', {}, statusBadge(f.status)),
          h('dt', {}, 'Severity'), h('dd', {}, severityBadge(f.impact_rank)),
          h('dt', {}, 'Type'), h('dd', {}, f.kind === 'review' ? 'Needs manual review' : 'Failed'),
          h('dt', {}, 'Rule'), h('dd', {}, h('code', {}, f.rule_id), f.custom ? h('div', { class: 'delta' }, 'Custom rule, not part of axe-core') : null),
          h('dt', {}, 'Criteria'), h('dd', {}, f.criteria.length
            ? f.criteria.map((c) => h('div', {}, h('a', { href: c.url, target: '_blank', rel: 'noopener' }, `${c.num} ${c.name || ''} (Level ${c.level || '?'})`, newTab())))
            : 'Best practice'),
          h('dt', {}, 'First seen'), h('dd', {}, fmtDate(f.first_seen_at)),
          h('dt', {}, 'Last seen'), h('dd', {}, fmtDate(f.last_seen_at)),
          h('dt', {}, 'Seen in'), h('dd', {}, `${f.seen_in.length} scan${f.seen_in.length === 1 ? '' : 's'}`),
          f.status === 'dismissed' && f.dismiss_reason ? [h('dt', {}, 'Dismissed because'), h('dd', {}, f.dismiss_reason)] : null))),
      h('div', { class: 'dlg-foot' },
        h('div', { class: 'row' },
          h('button', { disabled: index === 0, onclick: () => openFinding(index - 1) }, 'Previous finding'),
          h('button', { disabled: index >= state.items.length - 1, onclick: () => openFinding(index + 1) }, 'Next finding')),
        f.status === 'open'
          ? h('div', { class: 'row' }, h('div', {}, h('label', { for: 'dismiss-reason' }, 'Reason (optional)'), reason),
            h('button', { class: 'primary', onclick: async () => { await setStatus([f.id], 'dismissed', reason.value); await openFinding(state.items.findIndex((x) => x.id === f.id)); } }, 'Dismiss finding'))
          : h('button', { class: 'primary', onclick: async () => { await setStatus([f.id], 'open'); await openFinding(state.items.findIndex((x) => x.id === f.id)); } }, 'Restore finding')));
    if (!dialog.open) dialog.showModal();
    dialogBody.querySelector('h2').focus?.();
  }
  dialog.onclose = () => { opener?.isConnected ? opener.focus() : main.focus(); opener = null; };

  page(title, head, h('section', { class: 'card' }, searchForm, chips, searchError, filters, results));
  await load();
}

// ----------------------------------------------------------------- router

const routes = [
  [/^\/$/, viewOverview, 'overview'],
  [/^\/scans$/, viewScans, 'scans'],
  [/^\/scans\/(\d+)$/, viewScan, 'scans'],
  [/^\/scans\/(\d+)\/findings$/, viewFindings, 'scans'],
  [/^\/findings$/, viewFindings, 'findings'],
];

async function route(moveFocus = true) {
  stopView?.();
  stopView = null;
  if (dialog.open) dialog.close();
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const query = new URLSearchParams(qs);
  const hit = routes.map(([re, view, nav]) => ({ m: re.exec(path), view, nav })).find((r) => r.m);
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (hit && a.dataset.nav === hit.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  try {
    if (!hit) page('Not found', h('h1', {}, 'Page not found'), h('p', {}, h('a', { href: '#/' }, 'Go to the overview')));
    else await hit.view(hit.m.slice(1), query);
  } catch (e) {
    page('Error', h('h1', {}, 'Something went wrong'), h('p', { class: 'error', role: 'alert' }, e.message), h('p', {}, h('a', { href: '#/scans' }, 'Back to scans')));
  }
  if (moveFocus) main.focus();
}

window.addEventListener('hashchange', () => route());

if (HOSTED) {
  try {
    hosted = await (await import('./browser-api.js')).createBrowserApi();
    api = hosted.api;
  } catch (e) {
    page('Error', h('h1', {}, 'The checker could not start'), h('p', { class: 'error', role: 'alert' }, e.message));
    throw e;
  }
}
window.checkerApi = (...args) => api(...args); // lets tests and the console talk to whichever API is in use
config = await api('/api/config').catch(() => config);
document.getElementById('engine').textContent = config.engine;
route(false);
