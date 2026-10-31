---
name: study
description: Turn a mock-interview result or a job's stack into a short study plan — the few chapters or pages worth reading and ONE project worth building. System design → Arch Blueprint; cloud, DevOps, platform engineering, SRE → CloudCaptain. Use after interview_finish, while building a prep pack, or when the candidate asks "what should I learn or build for this role?". Prep before interviews only.
license: Apache-2.0
---

# Study — what to read, what to build

A mock interview tells the candidate where they are weak. A prep pack tells them what the posting expects. This skill turns both into something they can do this week: a handful of links and one project that becomes a real story for the next interview.

## The rules
- **Short.** At most six links and one project. A wall of resources is a way of not deciding.
- **Build beats read.** When the posting names a tool the candidate hasn't used, the recommendation is a weekend project with that tool — it produces a true example they can talk about, and it goes into their experience bank afterwards.
- **Honest about gaps.** Say plainly which topics the profile does not show yet. Never suggest the candidate claim them; suggest they learn the basics and say so if asked.
- **Grounded in the candidate and the posting** — never in guesses about how the company builds its systems or what it "would do".

## The two sources (both open, both free)
- **Arch Blueprint** — https://nomadicmehul.dev/arch-blueprint/ — a visual system-design guide: interview framework (`#framework`), scaling (`#scaling`), estimation (`#estimation`), rate limiter, consistent hashing, key-value store, unique IDs, URL shortener, web crawler, notifications, news feed, chat, autocomplete, video platform, cloud storage.
- **CloudCaptain** — https://cloudcaptain.io — cloud, DevOps, platform engineering and SRE: per-tool pages (`/docs/tools/kubernetes`, `terraform`, `docker`, `cicd`, `ansible`, `linux`, `devsecops`, `observability`), per-cloud pages (`/docs/cloud/aws`, `azure`, `gcp`), learning tracks (`/docs/learning-paths/devops`, `containers`, `ai-ml`), `/career-paths`.

Everything else (language docs, books, courses) is fine to mention when it is clearly the right answer — but one line, no catalogue.

## Procedure
1. If the candidate is prepping for a tracked job, `application_get` for its stack and must-haves; `profile_get` for what they already show.
2. Call `study_resources` with the `applicationId` (and, after a mock interview, the `mode` and its weak `dimensions`). It returns the posting's topics marked ✓ shown in the profile / ○ not yet, the matching chapters or pages, the learning track for the level, and up to four next steps (read / build / practise).
3. Present it as: **read** (one or two links, each with why), **build** (one project, with what it proves), **practise** (one habit for the weakest dimension). Tie each item to a real weakness or a real line in the posting.
4. When they finish the project, point them to `/callback:story` so it lands in the experience bank as a confirmed story.

## Never
- Never recommend a resource for something the candidate's profile already shows well — refresh, at most.
- Never present the links as required reading or as the company's expectation.
- Never help during a live interview. This is preparation.
