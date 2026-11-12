import { createHash } from 'node:crypto';

const SKIP_EXT = /\.(pdf|zip|gz|tar|tgz|rar|7z|dmg|exe|msi|pkg|jpg|jpeg|png|gif|svg|webp|ico|bmp|mp3|mp4|mov|avi|wav|webm|css|js|json|xml|rss|csv|xlsx?|docx?|pptx?|woff2?|ttf|eot)$/i;

/** Parse and validate a scan target. Only http and https are accepted. */
export function parseTarget(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  return u;
}

/** Canonical form used to de-duplicate pages within a crawl. */
export function normalizeUrl(input) {
  const u = parseTarget(input);
  return u ? u.href : null;
}

/** Should the crawler follow this link from a page on `origin`? */
export function isCrawlable(href, origin) {
  const u = parseTarget(href);
  if (!u || u.origin !== origin) return false;
  return !SKIP_EXT.test(u.pathname);
}

/**
 * Stable identity for a finding across scans: the same rule failing on the
 * same element of the same page is the same finding.
 */
export function fingerprint(ruleId, url, selector) {
  return createHash('sha1')
    .update(`${ruleId}\n${normalizeUrl(url) || url}\n${selector}`)
    .digest('hex')
    .slice(0, 20);
}
