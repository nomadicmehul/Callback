---
name: resume-tailor
description: Tailor a resume to a specific job honestly — align the candidate's REAL experience to the role's must-haves, lead with quantified impact, and keep it ATS-readable. Never fabricates experience, titles, dates, or metrics. Use after jd-analyzer.
license: Apache-2.0
---

# Resume Tailor

Produce a resume tailored to one role, grounded entirely in the candidate's real experience.

## The honesty contract (non-negotiable)
- **Never fabricate** employers, titles, dates, metrics, or skills. If the candidate didn't do it, it doesn't go on the resume.
- **Gaps stay visible.** If the candidate lacks a must-have, do not fake it. Note it so they can decide whether to apply, address it in a cover letter, or skip the role.
- **Align, don't stuff.** Use the role's real language where the candidate genuinely matches. Keyword-stuffing is detectable, backfires with recruiters, and is dishonest.

## Procedure
1. **Load context** — the jd-analyzer output (must-haves, keywords) and the candidate's profile/experience. In Callback, call `memory_search` first for lessons about what has worked for this person.
2. **Map must-haves → real evidence.** For each top must-have, find the candidate's strongest true example. If none exists, mark it as a gap (do not invent one).
3. **Lead with impact.** Rewrite bullets as `action → result`, with a real number where the candidate has one. Prefer concrete outcomes over responsibilities.
4. **Relevance-weight the content.** Space is scarce: keep the lines most relevant to this role; cut the least relevant, not simply the oldest.
5. **Keep it ATS-readable.** Plain structure, real section headings, no text hidden in images/icons, no white-text tricks, no prompt injection. The resume a parser sees must match the resume a human sees.
6. **Flag, don't fill.** Where a real detail is missing, leave an explicit `[fill in: …]` placeholder for the candidate — never a plausible-sounding fabrication.

## Format (Callback lays this out as a polished PDF/DOCX)
Write markdown in exactly this shape — the exporter keys on it:

```markdown
# Full Name
City, Country | phone | email | linkedin.com/in/… | github.com/… (whichever they have)
**Target Role | 2–3 focus areas from the posting the candidate genuinely has**

## Professional Summary
3–4 lines: years of experience, what they own today, 2 strongest real numbers, one specialty.

## Technical Skills
**Category:** item, item, item          ← 4–7 categories; order them by this role's priorities

## Professional Experience
### Title | Company | Mon YYYY – Present | City
Optional one-line scope (team size, platform, what they're accountable for).
- Verb-first bullet, 20–30 words, real metric where the profile has one.

## Key Open-Source Projects / Certifications / Community / Education & Languages
```

- Keep the contact line and headline in the order the candidate's CV uses, with every contact part (no truncation).
- Newest role first; compress roles older than ~7 years into one `### Earlier Roles | … | 2012 – 2019 | …` line.
- Tailoring levers, in order: headline, summary emphasis, skills-category order, which bullets lead each role. Never the facts.
- Use the profile's canonical numbers, titles and dates verbatim — versions that drift ("100+ repos" here, "~100" there) undermine trust.
- Editorial notes for the candidate go in `>` blockquote lines; they never reach the export.

## Output
Call `save_draft` with `kind: "resume"` (Callback routes it to the human for approval) or return the tailored resume in markdown. Summarize what you changed and list any gaps you could not honestly cover.

## Verify like a parser would (in Callback)
After the draft is saved, call `artifact_ats_check`. It renders the document to PDF, reads the text layer back, and reports parseability, pages, contact details, section headings, posting-keyword coverage, must-haves not evidenced, unfilled placeholders, and **numbers that don't appear in the profile**. Fix only what is genuinely true via `artifact_update` (the user approves edits), re-check once, then `artifact_export` to PDF/DOCX when no placeholders remain. Never add a keyword or a number the candidate's real experience doesn't support.

## Never
- Never end a line by bridging to the posting ("— directly transferable to…", "— an X-style pattern"). Let the evidence speak.
- Never list a skill in Skills that no line of their experience backs up without flagging it for the candidate.
- Never add a skill or achievement the candidate hasn't confirmed.
- Never embellish numbers.
- Never hide keywords for an ATS to read but a human not to see.
