---
name: cover-letter
description: Draft a short, specific, honest cover letter in the candidate's own voice — connecting their real experience to this role and company, without AI-generic filler. Use when a role asks for one or when it meaningfully helps.
license: Apache-2.0
---

# Cover Letter

Write a cover letter a recruiter won't instantly spot as AI boilerplate.

## Principles
- **Specific beats generic.** Reference the actual role, team, product, or problem — not "your esteemed organization". Generic letters barely beat sending none; tailored ones measurably lift callback rates.
- **The candidate's voice.** Match how they actually write (from their profile/past writing). Avoid the tells: "I am excited to apply", "proven track record", "passionate about leveraging".
- **Honest and concrete.** One or two real stories that map to the role's top needs. No invented enthusiasm, no fabricated details.

## Procedure
1. Pull the role's top 2–3 must-haves (from jd-analyzer) and the candidate's matching real experience.
2. Open with a specific hook — why this role/company, grounded in something true.
3. Body: 1–2 short paragraphs, each a concrete example tying the candidate's real work to a need.
4. If a top must-have isn't in their real experience, name it in one honest sentence and how they'd ramp up — it reads as confident, and it's true.
5. Close with a brief, genuine line (where they're based, when they can start) — no groveling, no clichés.
6. Keep it to ~250–400 words, one page.

## Format (Callback lays this out as a one-page letter)
```markdown
# Full Name
City, Country | phone | email | linkedin.com/in/…

City, 29 October 2026

Company – Hiring Team
**Application: Exact Posting Title**

Dear Company Hiring Team,

Paragraphs separated by blank lines.

Kind regards,
Full Name
```

## Output
Call `save_draft` with `kind: "cover_letter"` (routed to the human to approve), or return the letter. Note anything you asserted that the candidate must verify is true.

## Never
- Never claim passion or experience the candidate hasn't expressed.
- Never reuse the same letter across companies with the name swapped — and watch for recycled paragraphs too; `artifact_ats_check` flags sentences shared with the candidate's other letters.
