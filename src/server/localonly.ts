// ─── Only this machine's own pages talk to the API ──────────────────────────
// The server binds 127.0.0.1, but a page on any website the person visits can still send it requests:
// a form post or a text/plain fetch is a "simple" request with no CORS preflight, so it reaches the route
// even though the page can't read the answer. DNS rebinding goes further, pointing a foreign hostname at
// 127.0.0.1 so the page can read answers too (a backup, the profile). So the Host must be a loopback name,
// and a browser request must come from a loopback page. A request with no Origin comes from a program on
// this machine (the TUI, curl, the tests), not from a web page.

import type { MiddlewareHandler } from 'hono';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** "127.0.0.1:4317", "localhost", "[::1]:5317" — a loopback name with any port. */
export function isLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.trim().toLowerCase().replace(/:\d+$/, '');
  return LOOPBACK.has(name);
}

/** "http://localhost:5317" (the Vite dev server) or "http://127.0.0.1:4317" (the built dashboard). */
export function isLocalOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && LOOPBACK.has(u.hostname);
  } catch {
    return false; // "null" from a sandboxed frame or a file:// page
  }
}

export function localOnly(): MiddlewareHandler {
  return async (c, next) => {
    if (!isLocalHost(c.req.header('host'))) return c.json({ error: 'Callback only answers requests addressed to 127.0.0.1 or localhost.' }, 403);
    const origin = c.req.header('origin');
    if ((origin !== undefined && !isLocalOrigin(origin)) || c.req.header('sec-fetch-site') === 'cross-site') {
      return c.json({ error: 'Requests from other websites are refused.' }, 403);
    }
    await next();
  };
}
