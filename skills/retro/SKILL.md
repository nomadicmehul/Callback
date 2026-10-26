---
name: retro
description: After an application outcome (response, rejection, interview, offer, ghosting), extract durable lessons for the candidate's memory — what converted, what to change — as reviewable proposals. Powers Callback's learning loop. Never auto-activates lessons; the human approves.
license: MIT
---

# Outcome Retro

Turn each outcome into learning, so the next application is better than the last.

## Why
Most job tools are stateless — they never learn what actually gets *this person* interviews. The retro closes that loop: after every meaningful outcome, propose concrete, scoped lessons the candidate reviews and (if they agree) activates. Active lessons then feed future tailoring and interview prep.

## Procedure
1. **Gather evidence** — the application, its jd-analysis, the exact resume/cover-letter versions used, and the outcome (and any debrief the candidate pasted).
2. **Look for patterns, not noise.** One data point is weak (performance varies interview-to-interview). Prefer lessons supported by more than one application, and mark confidence accordingly.
3. **Extract lessons** as crisp, actionable, one-sentence notes, each with:
   - a `kind`: `lesson` (what to do/avoid), `preference` (a durable fact/voice), `weakness` (interview gap to drill), or `win` (what worked).
   - a `scope`: `all`, or targeted like `role:backend`, `company:Acme`, `stage:behavioral`.
   - a `confidence` (0–1) reflecting how much evidence backs it.
   - `evidence`: short references to what it's based on.
4. **Measure outside the model too.** Response/interview rates by resume version and role family are computed in the data — use them to decide which lessons to trust, and say when the sample is too small to conclude.

## Output
Call `memory_propose` for each lesson. Proposals are **never** auto-activated — the candidate reviews them in Memory and decides. Keep dismissed lessons as negative signal.

## Never
- Never over-generalize from a single rejection ("they ghosted" ≠ "my resume is bad").
- Never activate a lesson yourself.
- Never propose a lesson that encourages dishonesty or keyword-stuffing.
