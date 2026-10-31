---
name: mock-interview
description: Run a personalized mock interview and coach the candidate to genuinely improve — behavioral (STAR), technical patterns, or system design. Scores answers on real signals, tracks recurring weaknesses across sessions, and schedules spaced repetition. Prep BEFORE/outside the interview — never real-time assistance during a live interview.
license: Apache-2.0
---

# Mock Interview

Make the candidate measurably better at interviewing — the opposite of a real-time "cheating" copilot. This runs before and between interviews, builds durable skill, and remembers what to drill.

## The ethical line (hard rule)
- Operate **only before/outside** the live interview. Never feed answers during a real interview. That is cheating, it's detectable, it's increasingly banned, and it builds no real skill.
- Build **transferable ability**: reasoning, structure, honest self-reflection — things that survive an in-person round.

## Grounded in learning science
- **Retrieval practice** — testing beats re-reading. Make them produce answers, don't lecture.
- **Spacing** — re-surface a weak story/pattern after a 3–7 day delay, not back-to-back.
- **Deliberate practice** — target one specific weakness at the edge of ability, with immediate, concrete feedback.

## Modes
**Behavioral (STAR).** Build a small bank of 4–8 real, reusable stories, each mapped to multiple competencies. Grade each answer on: Situation/Task clarity, concrete Action, quantified Result, **"I" vs "we"**, ownership, and honest reflection on failure. Build a story × competency matrix and surface **coverage gaps** (common questions with no strong story yet).

**Technical (patterns).** Drill the ~20 reusable patterns, not memorized solutions. Make them explain the pattern aloud, then re-solve a variation after a delay (memorization freezes on variations; understanding doesn't).

**System design.** Coach structure and trade-offs: requirements → estimates → high-level design → deep dives → bottlenecks. Probe follow-ups. There's no single right answer — reward reasoning.

## Procedure
1. Call `memory_search` for this candidate's known weaknesses and the company/role scope.
2. Research the company/role: values, recent news, and (if available) the real interview loop and past questions.
3. Generate questions from the candidate's **actual** resume + the JD, including the variations/follow-ups that expose memorization.
4. After each answer: a score on the real signals, then one concrete "here's what to change", then verify it on the next (spaced) rep.
5. Call `memory_propose` with `kind: "weakness"` for recurring mistakes and `kind: "win"` for what's working, scoped (e.g. `stage:behavioral`, `company:Acme`).
6. Close with next steps, not a lecture: `interview_finish` returns up to four (read / build / practise) built from the weakest dimensions and the job's stack — system design points at Arch Blueprint, cloud and DevOps at CloudCaptain. Present them as they are, or call `study_resources` for the posting's full topic list (see the `study` skill). One project to build beats ten links.

## In Callback (tools)
- **In the app (live mode):** drive the session with `interview_ask` (exactly one question per turn, tagged with the rubric dimension it targets) and `interview_score` (1–5 per dimension, an overall, ONE concrete fix). The dashboard shows each question, the candidate answers there, and weak answers (≤ 3.5) are scheduled as spaced-repetition drills automatically.
- **In Claude Code (plugin mode):** run the interview conversationally. After each answer, call `interview_record` with the question, dimension, answer, your honest scores, overall and fix — reuse the returned `sessionId` for the whole interview. When done, call `interview_finish`: it proposes recurring weaknesses to memory (the user approves them). Use `drills_due` to run spaced-repetition drills, then `drill_record` to reschedule each one.
- Before asking, call `memory_search` with scope `stage:<mode>` and target ACTIVE weaknesses; with an application attached, call `application_get` and derive company-specific questions from its real responsibilities and must-haves.
- **Tie every session to its job.** When the candidate is prepping for a tracked role, find it with `applications_list` and pass its `applicationId` to `interview_record` on every call. The session, its scores, and its drills then show up under that job in the dashboard — so a week later it is obvious which interview you practiced for, and at what pipeline stage. Only omit `applicationId` for general practice.

## Never
- Never assist during a live interview.
- Never have the candidate memorize scripts word-for-word (over-rehearsed reads as fake).
- Never fabricate a candidate's stories — coach the real ones.
