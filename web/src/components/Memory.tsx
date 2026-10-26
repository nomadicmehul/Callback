import type { MemoryNote } from '@shared/types';
import { api } from '../lib/api';
import type { Memory } from '../lib/store';

function Note({
  note,
  actions,
  onChanged,
}: {
  note: MemoryNote;
  actions: { label: string; cls: string; to: 'active' | 'retired' }[];
  onChanged: () => void;
}) {
  async function set(to: 'active' | 'retired') {
    await api.setMemoryStatus(note.id, to);
    onChanged();
  }
  return (
    <div className="mem">
      <div className="kind">{note.kind}</div>
      <div className="c">{note.content}</div>
      <div className="foot">
        {note.scope !== 'all' && <span className="kbd">{note.scope}</span>}
        <span>confidence {Math.round(note.confidence * 100)}%</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {actions.map((act) => (
            <button key={act.label} className={`btn sm ${act.cls}`} onClick={() => set(act.to)}>
              {act.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MemoryView({ memory, onChanged }: { memory: Memory; onChanged: () => void }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        This is Callback’s memory of <b>you</b> — what works, what to avoid, and the interview weaknesses to drill. After every
        application and outcome, agents <b>propose</b> lessons here. Nothing becomes active until you approve it, and active
        lessons are fed back into future tailoring and interview prep.
      </p>

      <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '22px 0 10px' }}>
        Proposed — needs your review ({memory.proposed.length})
      </h3>
      {memory.proposed.length === 0 ? (
        <div className="col-empty">No proposals right now. Run a tailor pass or log an outcome.</div>
      ) : (
        memory.proposed.map((n) => (
          <Note
            key={n.id}
            note={n}
            onChanged={onChanged}
            actions={[
              { label: 'Activate', cls: 'primary', to: 'active' },
              { label: 'Dismiss', cls: 'ghost', to: 'retired' },
            ]}
          />
        ))
      )}

      <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '26px 0 10px' }}>
        Active — guiding your agents ({memory.active.length})
      </h3>
      {memory.active.length === 0 ? (
        <div className="col-empty">No active lessons yet.</div>
      ) : (
        memory.active.map((n) => (
          <Note key={n.id} note={n} onChanged={onChanged} actions={[{ label: 'Retire', cls: 'ghost', to: 'retired' }]} />
        ))
      )}
    </div>
  );
}
