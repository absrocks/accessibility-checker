// Scans pages with a real browser through Playwright.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { runCustomRulesInPage } from './core/custom-rules.js';
import {
  DEVICES, MAX_HTML, axeRunOptions, combineResults, crawl, devicesFor, engineLabel,
  mergeViewportResults, runAxeInPage, tagsFor,
} from './core/engine.js';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
export const AXE_VERSION = require('axe-core/package.json').version;
export const ENGINE = engineLabel(AXE_VERSION);

const NAV_TIMEOUT_MS = 45_000;
const SETTLE_TIMEOUT_MS = 5_000;

const MAC_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/**
 * On an Apple Silicon Mac, an Intel build of Node runs under Rosetta, and any
 * browser it starts is translated too, which makes page scripts several times
 * slower. In that case start the browser through `arch -arm64` so it runs
 * natively. Returns launch options to try first, or [] when not needed.
 */
function nativeArmLaunchers() {
  if (process.platform !== 'darwin' || process.arch !== 'x64') return [];
  try {
    const translated = execFileSync('/usr/sbin/sysctl', ['-n', 'sysctl.proc_translated'], { encoding: 'utf8' }).trim();
    if (translated !== '1') return [];
  } catch {
    return []; // a real Intel Mac has no such key
  }
  const dir = mkdtempSync(join(tmpdir(), 'a11y-checker-'));
  return MAC_BROWSERS.filter((path) => existsSync(path)).map((path, i) => {
    const wrapper = join(dir, `browser-${i}.sh`);
    writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/arch -arm64 "${path}" "$@"\n`, { mode: 0o755 });
    return { executablePath: wrapper };
  });
}

/**
 * Start a headless Chromium-family browser. Prefers an installed Google
 * Chrome or Edge so nothing has to be downloaded; falls back to a Chromium
 * installed with `npx playwright-core install chromium`.
 */
export async function launchBrowser() {
  let lastError;
  for (const options of [...nativeArmLaunchers(), { channel: 'chrome' }, { channel: 'msedge' }, {}]) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    'Could not start a browser. Install Google Chrome, or run "npx playwright-core install chromium". ' +
      `Last error: ${String(lastError?.message || lastError).split('\n')[0]}`,
  );
}

/** Load one URL in a fresh tab and evaluate it. Throws if the page cannot be loaded. */
export async function scanPage(context, url, { tags }) {
  const page = await context.newPage();
  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    } catch (e) {
      // A dropped or reset connection usually works on the second try; other failures do not.
      if (!/net::ERR_(SOCKET_NOT_CONNECTED|CONNECTION_(RESET|CLOSED|ABORTED)|NETWORK_CHANGED|HTTP2_)/.test(String(e?.message))) throw e;
      await page.waitForTimeout(600);
      response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    }
    if (response && response.status() >= 400) {
      throw new Error(`The server answered HTTP ${response.status()}`);
    }
    const type = response?.headers()['content-type'] || '';
    if (type && !/html/i.test(type)) throw new Error(`Not an HTML page (${type.split(';')[0]})`);
    await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
    // Finish any fade or slide at once, so colours are not measured mid-animation.
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    await page.addScriptTag({ content: axeSource });
    const axeResult = await page.evaluate(runAxeInPage, { runOptions: axeRunOptions(tags), maxHtml: MAX_HTML });
    // Rules axe-core does not have; they reuse the axe instance already on the page.
    const customRaw = await page.evaluate(runCustomRulesInPage, { maxHtml: MAX_HTML });
    return combineResults(axeResult, customRaw, page.url());
  } finally {
    await page.close().catch(() => {});
  }
}

/** Run one scan: every listed page, plus followed links, at each of its viewports. */
export async function crawlAndScan(scan, onPage) {
  const tags = tagsFor(scan);
  const devices = devicesFor(scan);
  const browser = await launchBrowser();
  try {
    const contexts = [];
    for (const name of devices) {
      // bypassCSP lets the checker inject axe on sites with a strict script policy.
      contexts.push(await browser.newContext({ ...DEVICES[name], bypassCSP: true, reducedMotion: 'reduce' }));
    }
    await crawl(scan, async (url) => {
      const perViewport = [];
      for (const context of contexts) perViewport.push(await scanPage(context, url, { tags }));
      return mergeViewportResults(perViewport, devices);
    }, onPage);
  } finally {
    await browser.close().catch(() => {});
  }
}
