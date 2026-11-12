// Write a static, read-only copy of the checker: the same interface, with
// the database's current contents saved as data.json. The result can be
// served by any static host, such as GitHub Pages.
//
//   node src/export.js <output-directory>
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore } from './db.js';
import { IMPACT_LABEL } from './score.js';
import { configView, describeScan, findingDetail, scanDetail } from './views.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything the static interface needs, as one JSON-serializable object. */
export function buildSnapshot(store, generatedAt = new Date().toISOString()) {
  const scans = store.listScans(null).map(describeScan);
  const details = {};
  const membership = {};
  const links = store.db.prepare('SELECT finding_id, page_id, kind FROM scan_findings WHERE scan_id = ? ORDER BY finding_id');
  for (const scan of scans) {
    details[scan.id] = scanDetail(store, store.getScan(scan.id));
    membership[scan.id] = links.all(scan.id).map((r) => [r.finding_id, r.page_id, r.kind]);
  }
  const findings = store.findFindings({ sort: 'id' }).map((f) => {
    const detail = findingDetail(store, f.id);
    return { ...detail, rule_help: f.rule_help, severity: IMPACT_LABEL[f.impact_rank] };
  });
  return { generated_at: generatedAt, config: configView(), sites: store.listSites(), scans, details, membership, findings };
}

export function exportSite(store, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const file of ['styles.css', 'app.js', 'static-api.js']) copyFileSync(join(root, 'public', file), join(outDir, file));
  // The interface filters findings itself in a snapshot, with the server's own search code.
  copyFileSync(join(root, 'src', 'search.js'), join(outDir, 'search.js'));
  const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');
  const marked = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="checker-mode" content="static">');
  if (marked === html) throw new Error('Could not mark index.html as a static snapshot');
  writeFileSync(join(outDir, 'index.html'), marked);
  const snapshot = buildSnapshot(store);
  writeFileSync(join(outDir, 'data.json'), JSON.stringify(snapshot));
  writeFileSync(join(outDir, '.nojekyll'), ''); // GitHub Pages: serve files as they are
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: node src/export.js <output-directory>');
    process.exit(2);
  }
  const store = openStore(process.env.A11Y_DB || join(root, 'data', 'checker.db'));
  const snapshot = exportSite(store, resolve(outDir));
  store.close();
  console.log(`Wrote a snapshot of ${snapshot.scans.length} scan(s) and ${snapshot.findings.length} finding(s) to ${resolve(outDir)}`);
}
