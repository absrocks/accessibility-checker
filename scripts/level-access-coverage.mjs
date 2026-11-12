// For every rule Level Access's Access Engine listed on a scan of
// https://hpc.njit.edu/Courses/ (12 Nov 2026: 8 failed, 2 flagged, 101
// passed), build a small page with that problem and see what this checker
// reports for it. Writes docs/level-access-coverage.md.
//
//   node scripts/level-access-coverage.mjs
//
// The examples are written from the rule names. Level Access's exact
// triggers are not public, so "caught" means the checker reports this
// example of the problem, not that it flags every case Level Access would.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOM_RULES, runCustomRulesInPage } from '../src/core/custom-rules.js';
import { launchBrowser } from '../src/scanner.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const page = (body, { lang = 'en', head = '<title>Test page</title>', bodyAttrs = '', h1 = true } = {}) =>
  `<!doctype html><html${lang === null ? '' : ` lang="${lang}"`}><head><meta charset="utf-8">${head}</head>` +
  `<body${bodyAttrs}><main>${h1 ? '<h1>Test page</h1>' : ''}${body}</main></body></html>`;
const c = (status, name, body, options) => ({ status, name, html: page(body, options) });
const img = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const notAllowed = (name, attr, value, host = 'h2') =>
  c('passed', name, host === 'p' ? `<p id="t" ${attr}="${value}">Text</p>` : `<h2 id="t" ${attr}="${value}">Heading</h2>`);

// status: how Level Access classified the rule on the scanned page.
const CASES = [
  // ---- failed on the scanned page ----
  c('failed', 'SVG element missing accessible name', '<svg id="t" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"></circle></svg>'),
  c('failed', 'Aria-expanded used where it is not allowed', '<nav id="t" aria-label="Pages" aria-expanded="false"><a href="#a">A</a></nav>'),
  c('failed', 'Iframe width set to absolute units', '<iframe id="t" title="Campus map" src="about:blank" width="600"></iframe>'),
  c('failed', 'Iframe height attribute uses absolute units', '<iframe id="t" title="Campus map" src="about:blank" height="400"></iframe>'),
  c('failed', 'Focusable elements cannot be missing an implicit or explicit role', '<div id="t" tabindex="0">Scrollable area</div>'),
  c('failed', 'Link has non-unique accessible name.', '<a id="t" href="/a">Clusters</a> <a href="/b">Clusters</a>'),
  c('failed', 'Non-large text without sufficient contrast.', '<p id="t" style="color:#aaaaaa;background:#ffffff">Small grey text</p>'),
  c('failed', 'A element contains visible text that is not found in the accessible name', '<a id="t" href="/next" aria-label="Next: Results"><span>Next</span> <span>Results</span></a>'),
  // ---- flagged for review on the scanned page ----
  c('flagged', 'Ul element is empty', '<ul id="t"></ul>'),
  c('flagged', 'Label element empty', '<label id="t"></label>'),
  // ---- passed on the scanned page ----
  c('passed', 'Server-side image map is used', `<a href="/map"><img id="t" src="${img}" alt="Map" ismap></a>`),
  c('passed', 'Element with role img or graphic missing accessible name', '<div id="t" role="img" style="width:20px;height:20px"></div>'),
  c('passed', 'Input type text missing accessible name', '<input id="t" type="text">'),
  c('passed', 'Button element missing accessible name.', '<button id="t" type="button"></button>'),
  c('passed', 'Link missing accessible name.', '<a id="t" href="/x"></a>'),
  c('passed', 'Input element type radio missing accessible name', '<input id="t" type="radio" name="r">'),
  c('passed', 'Body element has an aria-hidden attribute set to true', '<p>Text</p>', { bodyAttrs: ' id="t" aria-hidden="true"' }),
  c('passed', 'Element with role button missing accessible name', '<div id="t" role="button" tabindex="0"></div>'),
  c('passed', 'A element with href has presentation role', '<a id="t" href="/x" role="presentation">Link</a>'),
  c('passed', 'Button element contains an element that is not allowed', '<button id="t" type="button"><a href="/x">Inner link</a></button>'),
  c('passed', 'Element with role button contains an element that is not allowed', '<div id="t" role="button" tabindex="0"><button type="button">Inner</button></div>'),
  c('passed', 'Img element cannot have an accessible name and be marked as decorative', `<img id="t" src="${img}" alt="Logo" role="presentation">`),
  c('passed', 'Img element contained within elements whose children can only be presentational, is missing an accessible name.', `<button type="button"><img id="t" src="${img}"></button>`),
  notAllowed('Aria-sort used where it is not allowed', 'aria-sort', 'ascending'),
  c('passed', 'An alt attribute is not allowed on this element', '<div id="t" alt="Description">Text</div>'),
  notAllowed('Aria-pressed used where it is not allowed', 'aria-pressed', 'true'),
  c('passed', 'Head element cannot contain role or other ARIA attributes', '<p>Text</p>', { head: '<title>Test page</title><meta id="t" name="x" content="y" role="img" aria-hidden="true">' }),
  c('passed', 'Fieldset missing accessible name', '<fieldset id="t"><input type="radio" name="f" aria-label="One"><input type="radio" name="f" aria-label="Two"></fieldset>'),
  c('passed', 'HTML element missing lang attribute', '<p>Text</p>', { lang: null }),
  c('passed', 'Element has click listener but no keyboard listener', '<div id="t" onclick="go()">Open</div>'),
  c('passed', 'Link directly references an image', '<a id="t" href="photo.jpg">Photo</a>'),
  c('passed', 'Title element is empty', '<p>Text</p>', { head: '<title></title>' }),
  c('passed', 'Element with click or keyboard event listener missing a tabindex', '<span id="t" onclick="go()" onkeydown="go()">Open</span>'),
  c('passed', 'Role used on label where it is not allowed', '<label id="t" for="i" role="button">Name</label><input id="i" type="text">'),
  c('passed', 'Aria-disabled used where it is not needed and could conflict', '<button id="t" type="button" disabled aria-disabled="false">Save</button>'),
  c('passed', 'Iframe element missing accessible name.', '<iframe id="t" src="about:blank"></iframe>'),
  c('passed', 'Element with role img or graphics has suspicious accessible name', '<div id="t" role="img" aria-label="image" style="width:20px;height:20px"></div>'),
  c('passed', 'Link has suspicious accessible name.', '<a id="t" href="/next">&rarr;</a>'),
  notAllowed('Aria-checked used where it is not allowed', 'aria-checked', 'true'),
  notAllowed('Aria-level used where it is not allowed', 'aria-level', '2', 'p'),
  notAllowed('Aria-readonly used where it is not allowed', 'aria-readonly', 'true'),
  notAllowed('Aria-selected used where it is not allowed', 'aria-selected', 'true'),
  notAllowed('Aria-valuemin used where it is not allowed', 'aria-valuemin', '0'),
  notAllowed('Aria-required used where it is not allowed', 'aria-required', 'true'),
  notAllowed('Aria-modal used where it is not allowed', 'aria-modal', 'true'),
  notAllowed('Aria-autocomplete used where it is not allowed', 'aria-autocomplete', 'list'),
  c('passed', 'Aria-activedescendant attribute not allowed on this element', '<h2 id="t" aria-activedescendant="d">Heading</h2><span id="d">D</span>'),
  c('passed', 'Role use on link is not allowed', '<a id="t" href="/x" role="listitem">Link</a>'),
  c('passed', 'Aria-owns not allowed on img element', `<img id="t" src="${img}" alt="Chart" aria-owns="o"><span id="o">Owned</span>`),
  c('passed', 'Aria-owns not allowed on input element', '<input id="t" type="text" aria-label="Name" aria-owns="o"><span id="o">Owned</span>'),
  c('passed', "Element with role 'button' does not have tabindex", '<div id="t" role="button">Press</div>'),
  c('passed', 'Abstract ARIA roles are not allowed on any element', '<div id="t" role="widget">Text</div>'),
  c('passed', 'No headings exist', '<p>Text with no headings anywhere.</p>', { h1: false }),
  c('passed', 'Element has invalid role', '<div id="t" role="notarole">Text</div>'),
  c('passed', 'Use of role application is suspicious', '<div id="t" role="application" aria-label="Editor"><p>Text</p></div>'),
  c('passed', 'Multiple label elements with the same for attribute', '<label for="t">First</label><label for="t">Second</label><input id="t" type="text">'),
  c('passed', 'Iframe has suspicious accessible name', '<iframe id="t" title="frame" src="about:blank"></iframe>'),
  c('passed', 'Document title has suspicious name', '<p>Text</p>', { head: '<title>Untitled</title>' }),
  c('passed', 'Aria-hidden true used on interactive button', '<button id="t" type="button" aria-hidden="true">Save</button>'),
  c('passed', 'Link without negative tabindex has aria-hidden true', '<a id="t" href="/x" aria-hidden="true">Link</a>'),
  c('passed', 'Aria-hidden true used on input', '<input id="t" type="text" aria-label="Name" aria-hidden="true">'),
  c('passed', 'HTML element has invalid lang attribute', '<p>Text</p>', { lang: 'zz-not-a-language' }),
  c('passed', 'Fieldset with suspicious accessible name', '<fieldset id="t"><legend>fieldset</legend><input type="radio" name="f" aria-label="One"></fieldset>'),
  c('passed', 'Input type text with suspicious accessible name', '<input id="t" type="text" aria-label="input">'),
  c('passed', 'Input type radio with suspicious accessible name', '<input id="t" type="radio" name="r" aria-label="radio">'),
  c('passed', 'Button element has suspicious accessible name', '<button id="t" type="button">button</button>'),
  c('passed', 'Iframe has a src attribute set to an image file', '<iframe id="t" title="Results chart" src="chart.png"></iframe>'),
  c('passed', 'Element with role dialog missing accessible name', '<div id="t" role="dialog"><p>Are you sure?</p></div>'),
  c('passed', 'Element with role dialog has suspicious accessible name', '<div id="t" role="dialog" aria-label="dialog"><p>Are you sure?</p></div>'),
  c('passed', 'Focusable element with aria-hidden true', '<div id="t" tabindex="0" role="button" aria-hidden="true">Press</div>'),
  c('passed', 'Aria-checked used on input type radio where it is not needed and could conflict', '<input id="t" type="radio" name="r" aria-label="One" aria-checked="true">'),
  c('passed', 'Input element relies on the placeholder attribute as a fallback to provide an accessible name', '<input id="t" type="text" placeholder="Your name">'),
  c('passed', 'Document missing title element', '<p>Text</p>', { head: '' }),
  c('passed', 'Element with invalid ARIA attribute.', '<div id="t" role="button" tabindex="0" aria-notreal="x">Press</div>'),
  c('passed', 'Div element has an aria-label attribute', '<div id="t" aria-label="Summary">Text</div>'),
  c('passed', 'A elements without an href or tabindex >=0 are not in the focus order', '<a id="t" onclick="go()">Open</a>'),
  notAllowed('The aria-rowindextext attribute is not allowed on this element', 'aria-rowindextext', 'one'),
  notAllowed('The aria-colindextext attribute is not allowed on this element', 'aria-colindextext', 'one'),
  c('passed', 'Large text without sufficient contrast', '<p id="t" style="font-size:30px;color:#bbbbbb;background:#ffffff">Large grey text</p>'),
  notAllowed('Aria-multiline attribute not allowed on this element', 'aria-multiline', 'true'),
  c('passed', 'Li element without a parent list', '<div><li id="t">Item</li></div>'),
  c('passed', 'Meta element cannot have a role or other ARIA attributes', '<p>Text</p>', { head: '<title>Test page</title><meta id="t" name="x" content="y" role="presentation">' }),
  c('passed', 'Role used on style where it is not allowed', '<p>Text</p><style id="t" role="presentation">p{margin:0}</style>'),
  c('passed', 'Document title elements cannot have a role', '<p>Text</p>', { head: '<title id="t" role="heading">Test page</title>' }),
  c('passed', 'Ordered list contains non-allowed elements', '<ol id="t"><p>Not an item</p></ol>'),
  c('passed', 'Unordered list contains non-allowed elements', '<ul id="t"><div>Not an item</div></ul>'),
  notAllowed('Aria-multiselectable attribute is not allowed on this element', 'aria-multiselectable', 'true'),
  notAllowed('Aria-orientation attribute is not allowed on this element', 'aria-orientation', 'vertical'),
  notAllowed('Aria-valuemax used where it is not allowed', 'aria-valuemax', '10'),
  notAllowed('Aria-valuenow used where it is not allowed', 'aria-valuenow', '5'),
  notAllowed('Aria-valuetext attribute is not allowed on this element', 'aria-valuetext', 'five'),
  notAllowed('Aria-rowcount attribute is not allowed on this element', 'aria-rowcount', '3'),
  notAllowed('Aria-rowindex attribute is not allowed on this element', 'aria-rowindex', '1'),
  notAllowed('Aria-rowspan attribute is not allowed on this element', 'aria-rowspan', '2'),
  notAllowed('Aria-colcount attribute is not allowed on this element', 'aria-colcount', '3'),
  notAllowed('Aria-colindex attribute is not allowed on this element', 'aria-colindex', '1'),
  notAllowed('Aria-colspan attribute is not allowed on this element', 'aria-colspan', '2'),
  notAllowed('Aria-placeholder attribute is not allowed on this element', 'aria-placeholder', 'Name'),
  c('passed', 'Heading structure skips heading level', '<h3 id="t">Jumped from h1 to h3</h3>'),
  c('passed', 'Nav element missing unique accessible name', '<nav id="t" aria-label="Menu"><a href="#a">A</a></nav><nav aria-label="Menu"><a href="#b">B</a></nav>'),
  c('passed', 'Nav element missing accessible name', '<nav id="t"><a href="#a">A</a></nav><nav aria-label="Other"><a href="#b">B</a></nav>'),
  c('passed', 'HTML element with extended language or region in lang attribute', '<p>Text</p>', { lang: 'en-US-x-custom' }),
  c('passed', 'An alt attribute is not allowed on this element (on a link)', '<a id="t" href="/x" alt="Description">Link</a>'),
  c('passed', 'Element with role dialog is empty', '<div id="t" role="dialog" aria-label="Settings"></div>'),
  c('passed', 'Span element has aria-label that will not be used', '<span id="t" aria-label="Summary">Text</span>'),
  c('passed', 'Span element has aria-labelledby attribute that will not be used', '<span id="t" aria-labelledby="l">Text</span><p id="l">Label</p>'),
  c('passed', 'Div element has aria-labelledby attribute that will not be used', '<div id="t" aria-labelledby="l">Text</div><p id="l">Label</p>'),
  c('passed', 'Meta content attribute user-scalable is set to no', '<p>Text</p>', { head: '<title>Test page</title><meta name="viewport" content="width=device-width, user-scalable=no">' }),
  c('passed', 'Meta content attribute maximum-scale value is less than 2', '<p>Text</p>', { head: '<title>Test page</title><meta name="viewport" content="width=device-width, maximum-scale=1">' }),
  c('passed', 'Element has an autocomplete attribute set to a text value which contains one or more invalid tokens', '<input id="t" type="text" aria-label="Name" autocomplete="not-a-token">'),
  // ---- seen on other scans of the same site ----
  c('other scans', 'Img element missing accessible name', `<img id="t" src="${img}">`),
  c('other scans', 'Img element has suspicious alternative text.', `<img id="t" src="${img}" alt="image.jpg">`),
  c('other scans', 'Layout table not marked as role presentation', '<table id="t"><tr><td>Left column</td><td>Right column</td></tr></table>'),
];

/** Runs in the page: every rule that reported something, and whether it reported it on the #t element. */
async function evaluate({ tags, maxHtml, customSource }) {
  const results = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, iframes: false, elementRef: false });
  const onTarget = (rule) => rule.nodes.some((n) => n.target.join(' ').includes('#t')) || rule.nodes.some((n) => /^(html|body|head|title|meta)/.test(n.target.join(' ')));
  const pick = (list) => list.map((r) => ({ id: r.id, tags: r.tags, onTarget: onTarget(r) }));
  // eslint-disable-next-line no-new-func
  const custom = new Function(`return (${customSource})`)()({ maxHtml });
  return { violations: pick(results.violations), incomplete: pick(results.incomplete), custom: custom.hits.map((h) => ({ id: h.rule, onTarget: h.selector.includes('#t') })) };
}

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Rules that fire on many of the examples for reasons unrelated to the problem being shown:
// small click targets, any iframe at all, and the wording of the example's own link text.
const INCIDENTAL = new Set(['target-size', 'frame-tested', 'link-name-generic', 'link-name-short']);
const customLevel = new Map(CUSTOM_RULES.map((r) => [r.id, r.level]));

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const run = async (html) => {
  const tab = await context.newPage();
  try {
    await tab.setContent(html, { waitUntil: 'load' });
    await tab.addScriptTag({ content: axeSource });
    return await tab.evaluate(evaluate, { tags: [...WCAG_TAGS, 'best-practice'], maxHtml: 300, customSource: runCustomRulesInPage.toString() });
  } finally {
    await tab.close();
  }
};

// Whatever a clean page already reports is not caused by the example.
const baseline = await run(page('<p>Text</p>'));
const noise = new Set([...baseline.violations, ...baseline.incomplete, ...baseline.custom].map((r) => r.id));

const rows = [];
for (const test of CASES) {
  const r = await run(test.html);
  const relevant = (list) => list.filter((x) => !INCIDENTAL.has(x.id) && (x.onTarget || !noise.has(x.id)));
  const isWcag = (x) => x.tags.some((t) => /^wcag/.test(t));
  const failWcag = relevant(r.violations).filter(isWcag).map((x) => x.id);
  const failBest = relevant(r.violations).filter((x) => !isWcag(x)).map((x) => x.id);
  const review = relevant(r.incomplete).map((x) => x.id);
  const customFail = relevant(r.custom).filter((x) => customLevel.get(x.id) === 'error').map((x) => x.id);
  const customReview = relevant(r.custom).filter((x) => customLevel.get(x.id) === 'warning').map((x) => x.id);
  const uniq = (list) => [...new Set(list)];
  let verdict;
  let by;
  if (customFail.length || failWcag.length) {
    verdict = 'Caught';
    by = uniq([...customFail.map((id) => `${id} (custom)`), ...failWcag]);
  } else if (failBest.length) {
    verdict = 'Only with best practices on';
    by = uniq(failBest);
  } else if (review.length || customReview.length) {
    verdict = 'Flagged for review only';
    by = uniq([...customReview.map((id) => `${id} (custom)`), ...review]);
  } else {
    verdict = 'Not caught';
    by = [];
  }
  rows.push({ ...test, verdict, by });
}
await browser.close();

const order = ['Caught', 'Only with best practices on', 'Flagged for review only', 'Not caught'];
const count = (v, status) => rows.filter((r) => r.verdict === v && (!status || r.status === status)).length;
const lines = [
  '# Level Access rules and this checker',
  '',
  'Generated by `node scripts/level-access-coverage.mjs`. Do not edit by hand.',
  '',
  "Level Access's Access Engine listed 111 rules on its scan of `https://hpc.njit.edu/Courses/`",
  '(12 Nov 2026): 8 failed, 2 flagged for review, 101 passed (100 different names; one appears twice).',
  'For each one, the script builds a small page that has the problem and records what this checker',
  'reports for it. Three more rules seen on other scans of the same site are included.',
  '',
  'The examples are written from the rule names. Level Access does not publish what triggers each',
  'rule, so "Caught" means the checker reports this example, not that the two tools agree on every page.',
  '',
  '## Summary',
  '',
  '| Result | Rules | Of the 8 that failed | Of the 2 flagged | Of the 100 passed |',
  '|---|---:|---:|---:|---:|',
  ...order.map((v) => `| ${v} | ${count(v)} | ${count(v, 'failed')} | ${count(v, 'flagged')} | ${count(v, 'passed')} |`),
  `| **Total** | **${rows.length}** | **${rows.filter((r) => r.status === 'failed').length}** | **${rows.filter((r) => r.status === 'flagged').length}** | **${rows.filter((r) => r.status === 'passed').length}** |`,
  '',
];
for (const v of order) {
  const group = rows.filter((r) => r.verdict === v);
  if (!group.length) continue;
  lines.push(`## ${v} (${group.length})`, '', '| Level Access rule | On the scanned page | Reported by |', '|---|---|---|');
  const cite = (b) => (b.endsWith(' (custom)') ? `\`${b.slice(0, -9)}\` (custom)` : `\`${b}\``);
  for (const r of group) lines.push(`| ${r.name} | ${r.status} | ${r.by.map(cite).join(', ') || '—'} |`);
  lines.push('');
}
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'level-access-coverage.md'), `${lines.join('\n')}\n`);
writeFileSync(join(root, 'docs', 'level-access-coverage.json'), `${JSON.stringify(rows.map(({ html, ...r }) => r), null, 1)}\n`);
for (const v of order) console.log(`${v}: ${count(v)}`);
console.log(`Wrote docs/level-access-coverage.md (${rows.length} rules)`);
