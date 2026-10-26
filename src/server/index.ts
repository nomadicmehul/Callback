import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensureDataDir } from './paths';
import { initDb, listPendingApprovals } from './db';
import { apiRouter } from './routes';
import { subscribe } from './bus';
import { hasApiKey } from './config';
import { APP_VERSION } from './version';

// Zero-dependency .env support (Node loads it into process.env for us).
try {
  (process as any).loadEnvFile?.('.env');
} catch {
  /* no .env — that's fine, config comes from the dashboard */
}

ensureDataDir();
initDb();

const app = new Hono();
app.route('/api', apiRouter());

// ─── Live event stream (SSE) ────────────────────────────────────────────────
app.get('/events', (c) =>
  streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'hello', data: JSON.stringify({ version: APP_VERSION }) });
    // Re-sync a freshly connected client with anything already awaiting approval.
    for (const ap of listPendingApprovals()) {
      await stream.writeSSE({
        event: 'event',
        data: JSON.stringify({ type: 'approval_request', runId: ap.runId, ts: ap.createdAt, approval: ap }),
      });
    }
    const unsub = subscribe((ev) => {
      void stream.writeSSE({ event: 'event', data: JSON.stringify(ev) });
    });
    const ping = setInterval(() => {
      void stream.writeSSE({ event: 'ping', data: '1' });
    }, 25000);
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(ping);
        unsub();
        resolve();
      });
    });
  }),
);

// ─── Serve the built dashboard in production (dev uses the Vite server) ──────
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../dist/web');
if (fs.existsSync(webDir)) {
  app.use('/assets/*', serveStatic({ root: path.relative(process.cwd(), webDir) }));
  app.get('*', serveStatic({ path: path.relative(process.cwd(), path.join(webDir, 'index.html')) }));
}

const port = Number(process.env.CALLBACK_PORT ?? 4317);
serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  const url = `http://127.0.0.1:${info.port}`;
  const mode = hasApiKey() ? 'live (Claude)' : 'demo (no API key yet — add one in the dashboard for live agents)';
  console.log('');
  console.log(`  ⟳  Callback v${APP_VERSION}`);
  console.log(`     server   ${url}`);
  console.log(`     mode     ${mode}`);
  if (!fs.existsSync(webDir)) {
    console.log(`     dashboard run "npm run dev:web" (Vite), or "npm run build" then reload`);
  }
  console.log('');
});
