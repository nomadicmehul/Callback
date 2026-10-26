import { useEffect, useRef, useState } from 'react';
import type { RunEvent } from '@shared/types';

/** Subscribe to the server's live event stream. `onEvent` gets every RunEvent
 *  (run progress, approvals, artifacts, memory proposals) as it happens. */
export function useEventStream(onEvent: (event: RunEvent) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    const es = new EventSource('/events');
    es.addEventListener('open', () => setConnected(true));
    es.addEventListener('error', () => setConnected(false));
    es.addEventListener('event', (e) => {
      try {
        cb.current(JSON.parse((e as MessageEvent).data) as RunEvent);
      } catch {
        /* ignore malformed frames */
      }
    });
    return () => es.close();
  }, []);

  return { connected };
}
