/**
 * Runs queued scans one at a time. `scanner(scan, onPage)` does the work:
 * Playwright on the server, iframes on the published site, a stub in tests.
 */
export function createQueue(store, scanner) {
  const pending = [];
  let active = null;
  let idle = Promise.resolve();

  async function run(scanId) {
    const scan = store.getScan(scanId);
    if (!scan || scan.status !== 'queued') return;
    store.markRunning(scanId);
    try {
      await scanner(scan, (result) => store.savePage(scanId, result));
      store.finishScan(scanId);
    } catch (e) {
      store.markFailed(scanId, String(e?.message || e).split('\n')[0]);
    }
  }

  async function pump() {
    while (pending.length) {
      active = pending.shift();
      await run(active);
    }
    active = null;
  }

  return {
    enqueue(scanId) {
      pending.push(scanId);
      if (active === null) {
        active = scanId; // claim synchronously so two enqueues cannot both start a pump
        pending.pop();
        idle = run(scanId).then(pump);
      }
    },
    isBusy: (scanId) => active === scanId || pending.includes(scanId),
    /** Resolves when everything queued so far has finished. */
    whenIdle: () => idle,
  };
}
