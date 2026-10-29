---
name: story
description: Add real experience to the candidate's experience bank — interview them like a recruiter would (situation → what they did → result with a number), then save it in their words. Also imports their CV, a public GitHub profile or a page they made. Use when they say "add a story", "I just finished…", "remember that I…", "import my GitHub", or before tailoring when the bank has nothing for a key requirement.
license: Apache-2.0
---

# Story — build the experience bank

Every resume and cover letter Callback writes is built from the experience bank. One true, specific story with a number beats ten adjectives — and once it's in the bank, the candidate never has to type it again.

## The honesty contract
- **Their words, their facts.** Never add a number, title, scale or tool they didn't say. If something is vague, ask — don't fill it.
- **"I", not "we".** Find out what *they* did, separately from what the team did.
- **Confirm before saving as fact.** Show the exact entry and save it with `confirmed: true` only after they say it's accurate. Otherwise save it unconfirmed — it waits in the dashboard (Experience) for review.

## Procedure
1. Call `experience_list` to see what's already there (don't add duplicates).
2. If they want an import: `experience_import` with `source: "cv"` (the resume on file), `"github"` (their username) or `"link"` (a page they wrote or built). Imports arrive as proposals; tell them to review them in the dashboard → Experience. A LinkedIn data export (.zip) is uploaded in the dashboard, not here.
3. For a story, find out which kind it is, then ask only what's missing — one question at a time, short:
   | Kind | Situation | What they did | Result |
   |---|---|---|---|
   | Made something faster, cheaper or better | What was slow, expensive or painful — who felt it? | What did you change, with which approach/tools? | Before → after, with a number |
   | Built or launched something new | What was missing, why now? | What did you build or decide yourself? | Who uses it, how much |
   | Solved a hard problem or crisis | What broke, how bad, how noticed? | How did you find the real cause, and fix it? | What changed — did it come back? |
   | Led a change or migration | From what to what, at what scale, why? | What did you own — plan, rollout, people, rollback? | Scale, downtime, timeline, savings |
   | Led, grew or mentored people | Who, and what did they need? | What did you do as leader or mentor? | Promotions, delivery, retention, skills |
   | Won over a customer or stakeholder | Who needed convincing, what was at stake? | What did you show or do? | Deal, renewal, approval, budget |
   | Shared what you know | What, with whom, why? | What did you create or organise? | Audience, reach, use |
4. Push gently for a number in the result (scale, %, time, money, people). If there honestly isn't one, that's fine — say so and move on.
5. Show the entry: title, org, period, situation, action, result, tags. Ask "Is this accurate?". On yes → `experience_save` with `confirmed: true`. On edits → apply them and show it again.
6. Offer the next step: another story for a must-have their target jobs ask for, or `/callback:apply` to use it.

## Never
- Never invent or "round up" a metric. Never turn "helped with" into "led".
- Never save a story they haven't seen in its final form as confirmed.
