// The checker with no server: the same storage, queue and API code as the
// server (copied to ./lib by the export), running in the page on an sql.js
// database. It starts from the published results (checker.db); anything the
// visitor changes is kept in this browser's IndexedDB.
import { createApi } from './lib/api.js';
import { engineLabel } from './lib/engine.js';
import { createQueue } from './lib/jobs.js';
import { adaptSqlJs } from './lib/sqljs-adapter.js';
import { createStore } from './lib/store.js';
import { createBrowserScanner } from './browser-scanner.js';

const IDB_NAME = 'accessibility-checker';
const IDB_STORE = 'state';
const KEY = new URL('.', location.href).pathname; // one saved copy per published location

function withStore(mode, use) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(IDB_STORE, mode);
      const request = use(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => { open.result.close(); resolve(request.result); };
      tx.onerror = tx.onabort = () => { open.result.close(); reject(tx.error); };
    };
  });
}

const loadScript = (src) => new Promise((resolve, reject) => {
  const el = document.createElement('script');
  el.src = src;
  el.onload = resolve;
  el.onerror = () => reject(new Error(`Could not load ${src}`));
  document.head.append(el);
});

async function fetchOk(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res;
}

export async function createBrowserApi() {
  const snapshot = await (await fetchOk('snapshot.json')).json();
  await loadScript('vendor/sql-wasm.js');
  const SQL = await window.initSqlJs({ locateFile: (file) => `vendor/${file}` });

  // Saved state is best-effort: private windows may have no IndexedDB.
  let saved = null;
  let canSave = true;
  try {
    saved = await withStore('readonly', (s) => s.get(KEY));
  } catch {
    canSave = false;
  }
  const bytes = saved?.bytes || new Uint8Array(await (await fetchOk('checker.db')).arrayBuffer());
  const db = adaptSqlJs(new SQL.Database(bytes));
  const store = createStore(db);
  store.failInterrupted(); // a scan cut off by closing the tab can never finish

  let changed = Boolean(saved);
  let timer = null;
  const persist = () => {
    changed = true;
    if (!canSave) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Runs between operations, never inside one: store transactions are synchronous.
      withStore('readwrite', (s) => s.put({ bytes: db.export(), base: snapshot.generated_at, savedAt: new Date().toISOString() }, KEY))
        .catch(() => { canSave = false; });
    }, 250);
  };

  const scan = createBrowserScanner({ axeUrl: new URL('vendor/axe.min.js', location.href).href });
  const queue = createQueue(store, async (job, onPage) => {
    try {
      await scan(job, async (result) => {
        await onPage(result);
        persist();
      });
    } finally {
      persist();
    }
  });
  const handle = createApi({ store, queue, engine: engineLabel(snapshot.axe_version, 'run in the browser') });

  /** Same contract as the interface's fetch-based api(): data, or a thrown Error. */
  const api = async (path, { method = 'GET', body } = {}) => {
    const out = await handle(method, path, body);
    if (method !== 'GET') persist();
    if (out.status >= 400) throw new Error(out.json?.error || `Request failed (${out.status})`);
    if (out.text !== undefined) return out.text;
    return out.json === undefined ? null : JSON.parse(JSON.stringify(out.json));
  };

  return {
    api,
    publishedAt: snapshot.generated_at,
    /** True once this browser holds its own copy of the results. */
    hasLocalChanges: () => changed,
    /** True when the published results are newer than the copy this browser started from. */
    publishedIsNewer: () => Boolean(saved && saved.base !== snapshot.generated_at),
    canSave: () => canSave,
    /** Throw away this browser's copy and go back to the published results. */
    async reset() {
      clearTimeout(timer);
      if (canSave) await withStore('readwrite', (s) => s.delete(KEY)).catch(() => {});
      location.reload();
    },
  };
}
