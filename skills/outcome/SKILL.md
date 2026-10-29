---
name: outcome
description: Log what happened with an application (applied, screen, interview, offer, rejected, ghosted) and run a retro that proposes durable lessons for the candidate's memory. Use whenever the user reports news about a job they applied to — "they rejected me", "I got a screen", "offer came in", "never heard back".
license: Apache-2.0
argument-hint: <application or company> <stage> [note]
---

# Outcome — log it, learn from it

Every outcome is a data point for what actually gets *this* person callbacks.

## Procedure
1. Identify the application. If unclear, call `applications_list` and ask which one.
2. Call `outcome_record` with the stage (`applied` | `screen` | `interview` | `offer` | `rejected` | `ghosted`) and any detail the user shared (e.g. a debrief, feedback, who they spoke to).
3. **Retro** — follow the `retro` skill: gather the application, its analysis, the materials used (`application_get`), and what's already known (`memory_search`). Look for a pattern, not noise.
4. Propose at most **two** one-sentence lessons via `memory_propose`:
   - `kind`: `lesson` (what to do/avoid), `win` (what worked), `weakness` (interview gap to drill), or `preference`.
   - `scope`: `role:<family>`, `company:<name>`, `stage:<behavioral|technical|design>`, or `all`.
   - `confidence` ≤ 0.5 for a single data point; say so.
5. If the outcome was an interview or rejection with feedback, offer `/callback:interview`-style prep (the `mock-interview` skill) targeting the specific weakness.
6. Remind the user that proposals wait in **Memory** for their review and never auto-activate.

## Never
- Never over-generalize from one rejection or one ghosting.
- Never activate a lesson yourself.
- Never propose anything that encourages dishonesty or keyword-stuffing.
