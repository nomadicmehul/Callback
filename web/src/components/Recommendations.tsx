import type { Recommendation } from '@shared/types';

const ICON: Record<Recommendation['kind'], string> = { read: '📖', build: '🛠', practice: '🎯' };
const LABEL: Record<Recommendation['kind'], string> = { read: 'Read', build: 'Build', practice: 'Practise' };

/** Next steps after a mock interview: what to read, build and practise — with the source when it's a link. */
export function RecList({ recs, title }: { recs: Recommendation[]; title?: string }) {
  if (!recs.length) return null;
  return (
    <div className="recs">
      {title && <div className="scrim-note" style={{ marginBottom: 4 }}>{title}</div>}
      <ul className="recs-list">
        {recs.map((r, i) => (
          <li key={i} className={`rec ${r.kind}`}>
            <span className="rec-kind" title={LABEL[r.kind]}>
              {ICON[r.kind]}
            </span>
            <div>
              <b>{r.title}</b>
              <div className="rec-detail">{r.detail}</div>
              {r.url && (
                <a className="rec-link" href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.source ?? 'Open'} ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
