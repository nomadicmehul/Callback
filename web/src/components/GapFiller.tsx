import { useState } from 'react';
import { findGaps, type Gap, type GapFill } from '@shared/placeholders';

/** The line around a gap, with the gap itself highlighted. */
function Context({ gap }: { gap: Gap }) {
  const clean = (s: string) => s.replace(/^([-*•]|#+)\s+/, '').replace(/\*\*/g, '');
  const before = clean(gap.line.slice(0, gap.at));
  const after = gap.line.slice(gap.at + gap.token.length).replace(/\*\*/g, '');
  return (
    <div className="gap-ctx">
      {before.length > 110 ? '…' + before.slice(-110) : before}
      <mark className="gap">{gap.hint || 'fill in'}</mark>
      {after.length > 70 ? after.slice(0, 70) + '…' : after}
    </div>
  );
}

/** Walks the human through each `[fill in: …]` gap: type the real detail, or
 *  drop it when there's nothing true to say. Callback never suggests the content. */
export function GapFiller({
  content,
  busy,
  onSave,
  onCancel,
}: {
  content: string;
  busy: boolean;
  onSave: (fills: GapFill[]) => void;
  onCancel: () => void;
}) {
  const gaps = findGaps(content);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  const fills: GapFill[] = gaps.flatMap((g): GapFill[] =>
    dropped.has(g.index) ? [{ index: g.index, drop: true }] : answers[g.index]?.trim() ? [{ index: g.index, text: answers[g.index] }] : [],
  );
  const left = gaps.length - fills.length;
  const toggleDrop = (i: number) => {
    const next = new Set(dropped);
    next.has(i) ? next.delete(i) : next.add(i);
    setDropped(next);
  };

  return (
    <div className="gaps">
      <div className="gaps-head">
        <b>Fill the gaps</b>
        <span className="scrim-note">
          Real details only, in your words. Nothing true to put there? <b>Drop</b> it — a missing line beats a claim you can’t back up.
        </span>
      </div>
      {gaps.map((g) => (
        <div key={g.index} className={`gap-row${dropped.has(g.index) ? ' dropped' : ''}`}>
          <Context gap={g} />
          {dropped.has(g.index) ? (
            <div className="gap-input">
              <span className="scrim-note" style={{ flex: 1 }}>
                Will be removed from the draft.
              </span>
              <button className="btn ghost sm" onClick={() => toggleDrop(g.index)} disabled={busy}>
                Undo
              </button>
            </div>
          ) : (
            <div className="gap-input">
              <textarea
                rows={2}
                placeholder={g.hint || 'The real detail'}
                value={answers[g.index] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [g.index]: e.target.value })}
              />
              <button className="btn ghost sm" onClick={() => toggleDrop(g.index)} disabled={busy} title="Remove this from the draft">
                Drop
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="gap-foot">
        <span className="scrim-note">
          {left ? `${left} gap(s) will stay — export unlocks once none are left.` : 'All gaps resolved — export unlocks after saving.'}
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary sm" onClick={() => onSave(fills)} disabled={busy || !fills.length}>
          Save {fills.length || ''}
        </button>
      </div>
    </div>
  );
}
