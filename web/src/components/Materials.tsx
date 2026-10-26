import type { ApplicationMaterials } from '@shared/types';

/** What THIS job has: its own resume, cover letter, prep pack, and interview
 *  record. Shown on every pipeline card and at the top of the job drawer so it
 *  is never ambiguous which documents and interviews belong to which role. */
export function MaterialsRow({ m, compact = false }: { m: ApplicationMaterials; compact?: boolean }) {
  const items: { label: string; short: string; have: boolean; due?: boolean; title: string }[] = [
    { label: 'Resume', short: '📄', have: m.resume, title: m.resume ? 'Tailored resume saved for this job' : 'No resume yet — run Re-tailor' },
    { label: 'Cover letter', short: '✉', have: m.coverLetter, title: m.coverLetter ? 'Cover letter saved for this job' : 'No cover letter yet — run Re-tailor' },
    { label: 'Prep pack', short: '📋', have: m.prep, title: m.prep ? 'Interview prep pack ready' : 'No prep pack yet' },
    {
      label: m.interviews ? `${m.interviews} mock${m.interviews > 1 ? 's' : ''}${m.avgInterviewScore != null ? ` · ${m.avgInterviewScore}/5` : ''}` : 'Mock interview',
      short: m.interviews ? `🎤${m.interviews}` : '🎤',
      have: m.interviews > 0,
      title: m.interviews ? `${m.interviews} mock interview(s) for this job` : 'No mock interviews for this job yet',
    },
  ];
  if (m.drillsDue > 0) {
    items.push({ label: `${m.drillsDue} drill${m.drillsDue > 1 ? 's' : ''} due`, short: `⏰${m.drillsDue}`, have: true, due: true, title: 'Spaced-repetition drills due for this job' });
  }
  return (
    <div className="mats">
      {items.map((it) => (
        <span key={it.label} className={`mat ${it.have ? 'have' : ''} ${it.due ? 'due' : ''}`} title={it.title}>
          {compact ? it.short : `${it.have ? '✓' : '·'} ${it.label}`}
        </span>
      ))}
    </div>
  );
}
