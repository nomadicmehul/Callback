import type { Application, DashboardStats } from '@shared/types';
import { BOARD_COLUMNS, statusVar } from '../lib/ui';
import { MaterialsRow } from './Materials';

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}

export function Dashboard({ stats }: { stats: DashboardStats | null }) {
  if (!stats) return null;
  const s = stats.byStatus;
  const tiles: { k: string; v: string; sub?: string }[] = [
    { k: 'Tracked', v: String(stats.total) },
    { k: 'Ready to apply', v: String(s.ready) },
    { k: 'Response rate', v: pct(stats.responseRate), sub: 'any reply ÷ applied' },
    { k: 'Interview rate', v: pct(stats.interviewRate), sub: 'reached interview ÷ applied' },
    { k: 'Lessons learned', v: String(stats.lessons) },
    { k: 'Awaiting you', v: String(stats.pendingApprovals) },
  ];
  const funnel: [string, number][] = [
    ['applied', s.applied],
    ['screen', s.screen],
    ['interview', s.interview],
    ['offer', s.offer],
  ];
  const funnelTotal = funnel.reduce((a, [, n]) => a + n, 0);
  return (
    <>
      <div className="stat-row">
        {tiles.map((t) => (
          <div className="stat" key={t.k}>
            <div className="k">{t.k}</div>
            <div className="v">
              {t.v} {t.sub && <small>{t.sub}</small>}
            </div>
          </div>
        ))}
      </div>
      {funnelTotal > 0 && (
        <div className="funnel" title="Funnel: applied → screen → interview → offer">
          {funnel.map(([k, n]) => (
            <span
              key={k}
              style={{ flex: Math.max(n, 0.001), background: statusVar(k as any) }}
              title={`${k}: ${n}`}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Card({ app, onOpen }: { app: Application; onOpen: (id: string) => void }) {
  const running = app.status === 'drafting';
  return (
    <div
      className={`card ${running ? 'running' : ''}`}
      style={{ ['--chip' as any]: statusVar(app.status) }}
      onClick={() => onOpen(app.id)}
    >
      <div className="role">{app.role}</div>
      <div className="co">
        {app.company}
        {app.location && <span style={{ color: 'var(--text-faint)' }}> · {app.location}</span>}
      </div>
      <div className="meta">
        {app.fitScore != null && <span className="fit">{app.fitScore}/100 fit</span>}
        {running && <span className="fit" style={{ color: 'var(--warn)' }}>● drafting…</span>}
        {app.guardFlags?.length > 0 && (
          <span className="fit" style={{ color: 'var(--warn)' }} title={app.guardFlags.join('\n')}>
            ⚠ cleaned
          </span>
        )}
      </div>
      {app.materials && <MaterialsRow m={app.materials} compact />}
    </div>
  );
}

export function PipelineBoard({
  applications,
  onOpen,
}: {
  applications: Application[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="board">
      {BOARD_COLUMNS.map((status) => {
        const apps = applications.filter((a) => a.status === status);
        return (
          <div className="col" key={status}>
            <h3>
              <span className="dot" style={{ width: 8, height: 8, borderRadius: 4, background: statusVar(status) }} />
              {status}
              <span className="n">{apps.length}</span>
            </h3>
            <div className="cards">
              {apps.length === 0 ? (
                <div className="col-empty">—</div>
              ) : (
                apps.map((a) => <Card key={a.id} app={a} onOpen={onOpen} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
