---
name: setup
description: Onboard a candidate into Callback — capture their real experience (resume/CV) as the profile every draft is grounded in. Run this first, before /callback:apply. Use when the user is new, wants to add or replace their resume, or an agent reports "NO PROFILE ON FILE".
license: MIT
---

# Setup — your profile comes first

Callback never drafts from assumptions. Everything it writes is grounded in the candidate's **real** experience, so that has to exist before anything else.

## Procedure
1. Call the Callback `profile_get` tool. If a profile already exists, show the user a short summary (roles, years, top skills) and ask whether to keep it, replace it, or append to it.
2. Ask the user for their resume/CV. Accept any of:
   - a **file path** (PDF, DOCX, TXT, MD) — read it with your file-reading tool and extract the plain text;
   - **pasted text**;
   - a **LinkedIn export** or any "about me" write-up.
3. Normalize the text lightly (fix broken line-wrapping from PDF extraction, keep every fact). **Do not embellish, reorder achievements, or add anything the user didn't provide.**
4. Show the user the cleaned text and confirm it's accurate and complete. Ask one or two clarifying questions only where a fact is genuinely ambiguous (dates, titles).
5. Call `profile_set` with the confirmed text and `source` set to the filename (or "pasted").
6. Tell them what's next: `/callback:apply <job URL or pasted posting>` to capture a job and get honest, tailored materials — and that the dashboard (`node bin/callback.mjs`) shows everything.

## Never
- Never save a profile the user hasn't seen and confirmed.
- Never invent, inflate, or "improve" facts — only clean formatting.
