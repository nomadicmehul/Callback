import type { RunEvent } from '@shared/types';
import { eventIcon, eventText, fmtTime } from '../lib/ui';

export function ActivityFeed({ events, empty }: { events: RunEvent[]; empty?: string }) {
  if (!events.length) return <div className="col-empty">{empty ?? 'No activity yet.'}</div>;
  return (
    <div className="activity">
      {events.map((e, i) => (
        <div key={i} className={`ev ${e.type}`}>
          <span className="t">{fmtTime(e.ts)}</span>
          <span className="ic">{eventIcon(e)}</span>
          <span className="msg">{eventText(e)}</span>
        </div>
      ))}
    </div>
  );
}
