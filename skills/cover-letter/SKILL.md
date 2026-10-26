---
name: cover-letter
description: Draft a short, specific, honest cover letter in the candidate's own voice — connecting their real experience to this role and company, without AI-generic filler. Use when a role asks for one or when it meaningfully helps.
license: MIT
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
4. Close with a brief, genuine line — no groveling, no clichés.
5. Keep it to ~250–350 words, one page.

## Output
Call `save_draft` with `kind: "cover_letter"` (routed to the human to approve), or return the letter. Note anything you asserted that the candidate must verify is true.

## Never
- Never claim passion or experience the candidate hasn't expressed.
- Never reuse the same letter across companies with the name swapped.
