// The checker as a local web server: static interface plus the API.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { createApi } from './core/api.js';
import { createQueue } from './core/jobs.js';
import { openStore } from './db.js';
import { ENGINE, crawlAndScan } from './scanner.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(store, queue) {
  const handle = createApi({ store, queue, engine: ENGINE });
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use(express.static(join(root, 'public')));

  app.use('/api', async (req, res) => {
    const out = await handle(req.method, req.originalUrl, req.body);
    res.status(out.status);
    if (out.json !== undefined) return res.json(out.json);
    if (out.text !== undefined) {
      res.set('Content-Type', out.type);
      if (out.filename) res.set('Content-Disposition', `attachment; filename="${out.filename}"`);
      return res.send(out.text);
    }
    res.end();
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 4310;
  const store = openStore(process.env.A11Y_DB || join(root, 'data', 'checker.db'));
  const interrupted = store.failInterrupted();
  if (interrupted) console.log(`Marked ${interrupted} interrupted scan(s) as failed.`);
  // Bound to loopback: the checker fetches any URL it is given, so it should not be reachable from the network.
  createApp(store, createQueue(store, crawlAndScan)).listen(port, '127.0.0.1', () => {
    console.log(`Accessibility checker running at http://localhost:${port}`);
  });
}
