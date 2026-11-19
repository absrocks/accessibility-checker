// Scans pages from inside a web page, for the published copy of the checker
// where there is no server and no Playwright.
//
// How one page is scanned:
//   1. fetch() its HTML. This only works if the site allows other websites to
//      read it (a CORS header), or is on the same address as the checker.
//   2. Remove its scripts and load the HTML in a sandboxed iframe sized like
//      the viewport being checked. The sandbox gives the frame no access to
//      this page, its storage or its address.
//   3. Run axe-core and the custom rules inside that frame and post the
//      results back. Both are embedded in the frame's HTML, so a scan makes
//      no requests of its own beyond the page and what the page loads.
//
// Differences from the server scanner: the page's own scripts do not run, and
// a "mobile" scan is a narrow window, not an emulated phone.
import { runCustomRulesInPage } from './lib/custom-rules.js';
import {
  DEVICES, MAX_HTML, axeRunOptions, brokenStylesNote, combineResults, crawl, devicesFor, joinNotes,
  mergeViewportResults, runAxeInPage, stylesMissingMessage, tagsFor, thirdPartyStylesNote,
  trackStylesheetErrorsInPage, unloadedStylesheetsInPage,
} from './lib/engine.js';

const SCAN_TIMEOUT_MS = 60_000;

/** Runs inside the frame, after axe-core. Self-contained: sent as source text. */
/* c8 ignore start */
function frameMain(id, runOptions, maxHtml, tolerated, runAxe, runCustom, unloadedStylesheets) {
  let started = false;
  const reply = (payload) => window.parent.postMessage({ checkerScan: id, ...payload }, '*');
  const run = async () => {
    if (started) return;
    started = true;
    try {
      if (!window.axe) throw new Error('axe-core did not start in the page');
      const missing = unloadedStylesheets();
      // `tolerated` are stylesheets already known to be broken links on the site itself.
      const lost = missing.own.filter((href) => !tolerated.includes(href));
      if (lost.length) return reply({ ok: false, stylesMissing: lost });
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
      }
      // Finish any fade or slide at once, so colours are not measured mid-animation.
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.append(style);
      const axeResult = await runAxe({ runOptions, maxHtml });
      const customRaw = runCustom({ maxHtml });
      reply({ ok: true, axeResult, customRaw, brokenStyles: missing.own, thirdPartyStyles: missing.thirdParty });
    } catch (e) {
      reply({ ok: false, error: String((e && e.message) || e) });
    }
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
  setTimeout(run, 15000); // slow images or fonts should not hold the scan forever
}
/* c8 ignore stop */

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch() fails the same way for "the site does not allow this" and "the
 * network dropped". Try twice, then ask without reading the answer: if that
 * works, the site is reachable and the refusal is its policy.
 */
async function explainFailure(url) {
  if (location.protocol === 'https:' && url.startsWith('http:')) {
    return 'This address is not https, so it cannot be read from a secure page. Use the checker on your own computer for it.';
  }
  try {
    await fetch(url, { mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
    return 'This site does not let other websites read its pages, so it cannot be scanned from here. Use the checker on your own computer for it. ' +
      '(If you run the site: it would need to send the header Access-Control-Allow-Origin.)';
  } catch {
    return 'This address could not be reached. Check it and your connection, then run the scan again.';
  }
}

/**
 * What the site answers for a stylesheet that did not load in the scan frame:
 * its HTTP status, 0 if it answers but the answer cannot be read from here,
 * or null if it does not answer. `lenient` is for a stylesheet that has now
 * failed twice: any answer then means the site does not serve it as a
 * stylesheet. On the first failure only a readable error status counts, since
 * a dropped connection looks the same as an unreadable answer.
 */
async function stylesheetAnswer(href, lenient) {
  try {
    const response = await fetch(href, { credentials: 'omit', cache: 'no-store' });
    return response.status >= 400 || lenient ? response.status : null;
  } catch { /* not readable from here, or not reachable */ }
  if (!lenient) return null;
  try {
    await fetch(href, { mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
    return 0;
  } catch {
    return null;
  }
}

/** Read a page's HTML, or explain in plain words why that is not possible. */
async function fetchPage(url) {
  let response;
  for (let attempt = 1; !response; attempt++) {
    try {
      response = await fetch(url, { credentials: 'omit', redirect: 'follow', cache: 'no-store' });
    } catch {
      if (attempt === 2) throw new Error(await explainFailure(url));
      await pause(600); // a dropped connection usually works on the second try
    }
  }
  if (!response.ok) throw new Error(`The server answered HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (type && !/html/i.test(type)) throw new Error(`Not an HTML page (${type.split(';')[0]})`);
  return { html: await response.text(), url: response.url || url };
}

/**
 * Turn fetched HTML into a document that can be rendered safely and scanned:
 * no scripts of its own, relative addresses resolved against where it came
 * from, the checker's rules added at the end, and `headScripts` placed
 * before anything else in the head so they run before the page's links load.
 */
export function prepareHtml(html, pageUrl, scripts, headScripts = []) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const declared = doc.querySelector('base[href]')?.getAttribute('href');
  let base = pageUrl;
  try {
    if (declared) base = new URL(declared, pageUrl).href;
  } catch { /* keep the page's own address */ }

  for (const el of doc.querySelectorAll('script, base, meta[http-equiv="refresh" i]')) el.remove();
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name === 'srcdoc') el.removeAttribute(attr.name);
      else if (name.startsWith('on')) {
        // Handlers must not run, but rules about mouse-only controls need to know they were there.
        el.setAttribute(`data-checker-${name}`, attr.value);
        el.removeAttribute(attr.name);
      }
    }
  }
  // Sites that style a no-script state (class="no-js") would otherwise be
  // scanned in that state. Scripts are not run here, but visitors do have them.
  const root = doc.documentElement;
  if (root.classList.contains('no-js')) root.classList.replace('no-js', 'js');

  const baseEl = doc.createElement('base');
  baseEl.setAttribute('href', base);
  doc.head.prepend(baseEl);
  // A marker element, swapped for script tags after serializing (the parser would not run scripts added here).
  const marker = doc.createElement('meta');
  marker.setAttribute('name', 'checker-head-scripts');
  baseEl.after(marker);

  const tag = (src) => `<script src="${src}"></script>`;
  let out = `<!doctype html>${root.outerHTML}`.replace(marker.outerHTML, headScripts.map(tag).join(''));
  const tags = scripts.map(tag).join('');
  const end = out.lastIndexOf('</body>');
  out = end === -1 ? out + tags : out.slice(0, end) + tags + out.slice(end);
  return out;
}

let scanCounter = 0;

/**
 * Render prepared HTML at one viewport and run the rules in it. `broken` maps
 * the stylesheets known to be broken links on the site to their HTTP status.
 */
function scanInFrame(page, deviceName, tags, axeSource, broken = new Map()) {
  return new Promise((resolve, reject) => {
    const id = `scan-${Date.now()}-${++scanCounter}`;
    const { width, height } = DEVICES[deviceName].viewport;
    const runner =
      `${axeSource}\n;(${frameMain.toString()})(${JSON.stringify(id)}, ${JSON.stringify(axeRunOptions(tags))}, ${MAX_HTML}, ${JSON.stringify([...broken.keys()])}, ` +
      `${runAxeInPage.toString()}, ${runCustomRulesInPage.toString()}, ${unloadedStylesheetsInPage.toString()});`;

    const frame = document.createElement('iframe');
    // allow-scripts only: the frame gets a throwaway origin and cannot reach this page.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.title = 'Page being scanned';
    // Kept inside the viewport (invisible, behind the page): browsers stop
    // laying out frames that are scrolled away or hidden.
    frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none;z-index:-1;`;

    const finish = (fn, value) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
      fn(value);
    };
    const onMessage = (event) => {
      if (event.source !== frame.contentWindow || event.data?.checkerScan !== id) return;
      if (event.data.ok) {
        const note = joinNotes(
          brokenStylesNote(event.data.brokenStyles.map((href) => [href, broken.get(href)])),
          thirdPartyStylesNote(event.data.thirdPartyStyles),
        );
        finish(resolve, combineResults(event.data.axeResult, event.data.customRaw, page.url, note));
      } else if (event.data.stylesMissing) finish(reject, Object.assign(new Error(stylesMissingMessage(event.data.stylesMissing)), { stylesMissing: event.data.stylesMissing }));
      else finish(reject, new Error(`The page could not be evaluated: ${event.data.error}`));
    };
    const timer = setTimeout(() => finish(reject, new Error('The page took too long to load and evaluate')), SCAN_TIMEOUT_MS);
    window.addEventListener('message', onMessage);

    frame.srcdoc = prepareHtml(page.html, page.url,
      [`data:text/javascript;base64,${toBase64(runner)}`],
      [`data:text/javascript;base64,${toBase64(`(${trackStylesheetErrorsInPage.toString()})();`)}`]);
    document.body.append(frame);
  });
}

/**
 * Scan one page at one viewport, dealing with stylesheets that do not load.
 * One lost to a dropped connection leaves the page unstyled, so the page is
 * rendered again; if it is still missing and the site gives no answer for it,
 * the scan refuses. One the site answers but does not serve is a broken link
 * that every visitor gets: the page is scanned with a note.
 */
async function scanOneViewport(page, device, tags, axeSource) {
  const broken = new Map();
  for (let attempt = 1; ; attempt++) {
    try {
      return await scanInFrame(page, device, tags, axeSource, broken);
    } catch (e) {
      if (!e.stylesMissing || attempt === 3) throw e;
      let lost = 0;
      for (const href of e.stylesMissing) {
        const status = await stylesheetAnswer(href, attempt === 2);
        if (status === null) lost += 1;
        else broken.set(href, status);
      }
      if (lost && attempt === 2) throw e;
      if (lost) await pause(800);
    }
  }
}

/** A scanner with the same shape as the server's crawlAndScan(scan, onPage). */
export function createBrowserScanner({ axeUrl }) {
  let axeSource = null; // loaded once, on the first scan
  const loadAxe = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(axeUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
      } catch (e) {
        if (attempt === 3) throw new Error(`The checker could not load its rules (axe-core): ${e.message}`);
        await pause(600);
      }
    }
  };

  return async function crawlAndScan(scan, onPage) {
    const tags = tagsFor(scan);
    const devices = devicesFor(scan);
    axeSource ??= await loadAxe();
    await crawl(scan, async (url) => {
      const page = await fetchPage(url);
      const perViewport = [];
      for (const device of devices) perViewport.push(await scanOneViewport(page, device, tags, axeSource));
      return mergeViewportResults(perViewport, devices);
    }, onPage);
  };
}
