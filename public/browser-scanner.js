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
  DEVICES, MAX_HTML, axeRunOptions, combineResults, crawl, devicesFor,
  mergeViewportResults, runAxeInPage, tagsFor,
} from './lib/engine.js';

const SCAN_TIMEOUT_MS = 60_000;

/** Runs inside the frame, after axe-core. Self-contained: sent as source text. */
/* c8 ignore start */
function frameMain(id, runOptions, maxHtml, runAxe, runCustom) {
  let started = false;
  const reply = (payload) => window.parent.postMessage({ checkerScan: id, ...payload }, '*');
  const run = async () => {
    if (started) return;
    started = true;
    try {
      if (!window.axe) throw new Error('axe-core did not start in the page');
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
      }
      // Finish any fade or slide at once, so colours are not measured mid-animation.
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.append(style);
      const axeResult = await runAxe({ runOptions, maxHtml });
      const customRaw = runCustom({ maxHtml });
      reply({ ok: true, axeResult, customRaw });
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
    return 'This site does not let other websites read its pages, so it cannot be scanned from here. Use the checker on your own computer for it.';
  } catch {
    return 'This address could not be reached. Check it and your connection, then run the scan again.';
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
 * from, and the checker's two scripts added at the end.
 */
export function prepareHtml(html, pageUrl, scripts) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const declared = doc.querySelector('base[href]')?.getAttribute('href');
  let base = pageUrl;
  try {
    if (declared) base = new URL(declared, pageUrl).href;
  } catch { /* keep the page's own address */ }

  for (const el of doc.querySelectorAll('script, base, meta[http-equiv="refresh" i]')) el.remove();
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || attr.name.toLowerCase() === 'srcdoc') el.removeAttribute(attr.name);
    }
  }
  // Sites that style a no-script state (class="no-js") would otherwise be
  // scanned in that state. Scripts are not run here, but visitors do have them.
  const root = doc.documentElement;
  if (root.classList.contains('no-js')) root.classList.replace('no-js', 'js');

  const baseEl = doc.createElement('base');
  baseEl.setAttribute('href', base);
  doc.head.prepend(baseEl);

  const tags = scripts.map((src) => `<script src="${src}"></script>`).join('');
  const out = `<!doctype html>${root.outerHTML}`;
  const end = out.lastIndexOf('</body>');
  return end === -1 ? out + tags : out.slice(0, end) + tags + out.slice(end);
}

let scanCounter = 0;

/** Render prepared HTML at one viewport and run the rules in it. */
function scanInFrame(page, deviceName, tags, axeSource) {
  return new Promise((resolve, reject) => {
    const id = `scan-${Date.now()}-${++scanCounter}`;
    const { width, height } = DEVICES[deviceName].viewport;
    const runner =
      `${axeSource}\n;(${frameMain.toString()})(${JSON.stringify(id)}, ${JSON.stringify(axeRunOptions(tags))}, ${MAX_HTML}, ` +
      `${runAxeInPage.toString()}, ${runCustomRulesInPage.toString()});`;

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
      if (event.data.ok) finish(resolve, combineResults(event.data.axeResult, event.data.customRaw, page.url));
      else finish(reject, new Error(`The page could not be evaluated: ${event.data.error}`));
    };
    const timer = setTimeout(() => finish(reject, new Error('The page took too long to load and evaluate')), SCAN_TIMEOUT_MS);
    window.addEventListener('message', onMessage);

    frame.srcdoc = prepareHtml(page.html, page.url, [`data:text/javascript;base64,${toBase64(runner)}`]);
    document.body.append(frame);
  });
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
      for (const device of devices) perViewport.push(await scanInFrame(page, device, tags, axeSource));
      return mergeViewportResults(perViewport, devices);
    }, onPage);
  };
}
