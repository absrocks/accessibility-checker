// Write a copy of the checker that needs no server: the interface, the shared
// code from src/core, an in-browser SQLite, axe-core, and the database as it
// is now. Any static host, such as GitHub Pages, can serve the result.
//
//   node src/export.js <output-directory>
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore } from './db.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const VENDOR_NOTICE = `Third-party files in this folder, unmodified:

axe.min.js       axe-core, Deque Systems, Mozilla Public License 2.0
                 https://github.com/dequelabs/axe-core
sql-wasm.js      sql.js, MIT License
sql-wasm.wasm    https://github.com/sql-js/sql.js (SQLite itself is in the public domain)
`;

/** Copy the database to `file` as one plain SQLite file an in-memory reader can open. */
function copyDatabase(store, file) {
  if (existsSync(file)) rmSync(file);
  store.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  // The live database uses write-ahead logging, which needs side files the browser copy cannot have.
  const copy = new DatabaseSync(file);
  copy.exec('PRAGMA journal_mode = DELETE');
  copy.close();
}

export function exportSite(store, outDir, generatedAt = new Date().toISOString()) {
  for (const dir of ['', 'lib', 'vendor']) mkdirSync(join(outDir, dir), { recursive: true });

  for (const file of ['styles.css', 'app.js', 'browser-api.js', 'browser-scanner.js']) {
    copyFileSync(join(root, 'public', file), join(outDir, file));
  }
  const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');
  const marked = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="checker-mode" content="static">');
  if (marked === html) throw new Error('Could not mark index.html as the published copy');
  writeFileSync(join(outDir, 'index.html'), marked);

  // The same storage, queue, API and rule code the server runs.
  const core = join(root, 'src', 'core');
  for (const file of readdirSync(core).filter((f) => f.endsWith('.js'))) copyFileSync(join(core, file), join(outDir, 'lib', file));

  const sqlDist = dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  copyFileSync(join(sqlDist, 'sql-wasm.js'), join(outDir, 'vendor', 'sql-wasm.js'));
  copyFileSync(join(sqlDist, 'sql-wasm.wasm'), join(outDir, 'vendor', 'sql-wasm.wasm'));
  copyFileSync(require.resolve('axe-core/axe.min.js'), join(outDir, 'vendor', 'axe.min.js'));
  writeFileSync(join(outDir, 'vendor', 'NOTICE.txt'), VENDOR_NOTICE);

  copyDatabase(store, join(outDir, 'checker.db'));
  const snapshot = {
    generated_at: generatedAt,
    axe_version: require('axe-core/package.json').version,
    scans: store.listScans(null).length,
    findings: store.findFindings({}).length,
  };
  writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
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
  console.log(`Wrote the checker with ${snapshot.scans} scan(s) and ${snapshot.findings} finding(s) to ${resolve(outDir)}`);
}
