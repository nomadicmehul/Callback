import type {
  Application,
  Approval,
  DashboardStats,
  HealthInfo,
  RunEvent,
} from '@shared/types';

export const PORT = process.env.CALLBACK_PORT ?? '4317';
export const BASE = `http://127.0.0.1:${PORT}`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export const net = {
  health: () => get<HealthInfo>('/api/health'),
  stats: () => get<DashboardStats>('/api/stats'),
  applications: () => get<Application[]>('/api/applications'),
  approvals: () => get<Approval[]>('/api/approvals'),
  resolveApproval: (id: string, decision: 'allow' | 'deny') =>
    post<{ approval: Approval }>(`/api/approvals/${id}`, { decision }),
  createApplication: (body: { company: string; role: string; jdText: string }) =>
    post<{ application: Application; runId: string | null }>('/api/applications', { ...body, tailor: true }),
};

/** Wait until the server answers /api/health, retrying for up to `timeoutMs`. */
export async function waitForServer(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await net.health();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

/** Consume the server's SSE stream using fetch (Node has no global EventSource).
 *  Reconnects until aborted. */
export async function streamEvents(
  onEvent: (e: RunEvent) => void,
  handlers: { onOpen?: () => void; onError?: () => void },
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const res = await fetch(BASE + '/events', { headers: { accept: 'text/event-stream' }, signal });
      if (!res.body) throw new Error('no body');
      handlers.onOpen?.();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = 'message';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (event === 'event' && data) {
            try {
              onEvent(JSON.parse(data) as RunEvent);
            } catch {
              /* skip malformed */
            }
          }
        }
      }
    } catch {
      handlers.onError?.();
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
