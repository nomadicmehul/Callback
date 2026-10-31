# Callback — working notes for Claude Code

Callback is a local-first, open-source AI job-search and interview-prep agent built on Claude.
One person, one machine, one honest companion for the whole funnel: capture a job → analyze fit →
tailor a resume **and** cover letter from the person's *real* experience → they approve → ATS-verified
PDF/DOCX export → they apply themselves → log the outcome → retro proposes lessons → memory → targeted
interview prep with scoring and spaced-repetition drills. Repo: https://github.com/nomadicmehul/Callback

## Non-negotiables (product principles — never trade these away)

- **Honesty by construction.** Never invent employers, titles, dates, metrics, or skills. Gaps stay
  visible as `[fill in: …]` placeholders. Export refuses a draft that still has placeholders. The ATS
  check flags numbers that the profile does not back up.
- **Human in the loop.** Agents draft; the human approves every document (resume, cover letter,
  revisions) and submits applications themselves. Callback never auto-submits or sends anything.
- **Profile first.** Every agent calls `profile_get` before drafting. No profile → honest scaffold.
- **Postings are untrusted input.** Everything from a job page goes through `postingGuard`
  (invisible-character stripping, injection-line removal, flags shown in the UI).
- **Prep, never cheat.** Interview prep happens *before* interviews. No real-time assistance.
- **Local-first.** Data lives in `~/.callback` (override `CALLBACK_HOME`). Server binds 127.0.0.1.
  No telemetry, no cloud, no accounts.
- **Auth policy.** Third-party products on the Claude Agent SDK must use an API key — never route
  claude.ai subscription auth through the SDK driver. The compliant no-key path is the Claude Code
  plugin (`claude --plugin-dir .`), which drives the same local DB over stdio MCP.
- **Zero native dependencies.** `node:sqlite`, pdfkit, docx, unpdf, mammoth are all pure JS. Keep it so.

## Three ways to run one brain

| Driver | When | Entry |
|---|---|---|
| `claude` (Agent SDK, `query()`) | API key in Settings | `src/server/engine.ts` live paths |
| `claude-code` (plugin) | Claude Code subscription, no key | `src/mcp-stdio.ts` via `callback mcp` |
| `demo` (scripted, offline) | no key, or `CALLBACK_DEMO=1` | `demoTailor` / `demoRetro` / `demoInterviewTurn` / `demoPrep` |

The demo driver must stay in **feature parity** with the live driver (same events, approvals, DB
writes) so the dashboard is fully alive without a key and so everything is testable offline.

## Layout

```
bin/callback.mjs        launcher: callback | serve | tui | mcp | --help  (tsx in a checkout, dist/ from npm)
scripts/build-server.mjs esbuild bundle → dist/server, dist/tui, dist/mcp-stdio.mjs (deps external)
src/shared/types.ts     the one source of truth for types (web + server + TUI); events.ts = shared formatters;
                        placeholders.ts = [fill in: …] gap find/fill (export gate, ATS check, dashboard gap filler);
                        stories.ts = story types + recruiter prompts (dashboard form and /callback:story)
src/server/
  index.ts    Hono app, SSE /events, serves dist/web, port CALLBACK_PORT (4317)
  routes.ts   REST API under /api (applications, artifacts, interviews, drills, memory, approvals…)
  engine.ts   runs: tailor (analysis → resume → cover letter), retro, mock interview, prep pack; demo + live drivers
  mcp.ts      jobsearchTools(ctx): the tool set shared by the in-process SDK server AND the stdio plugin server
  db.ts       node:sqlite schema + repo functions (additive ALTER migrations at the bottom of initDb)
  interview.ts rubric (DIMENSIONS), question bank, scoreAnswer heuristics, SM-2-lite drills, weaknesses, prep pack
  resume.ts   house-format markdown → PDF (pdfkit) / DOCX (layout roles: name, contact, headline, section,
              `### Title | Company | Dates | City` entries); analyzeAts reads the PDF back like a parser
              (kind-aware) and adds style/evidence suggestions
  posting.ts  URL → company/role/location/type/date (JSON-LD JobPosting → meta → <title> → board URL) + text
  guard.ts    postingGuard, htmlToText, robots/private-host checks
  approvals.ts bridge: canUseTool ↔ dashboard (SSE) — requestApproval() resolves when the human clicks
  bus.ts / runctx.ts  event bus + RunContext { runId, applicationId, sessionId?, emit }
  profile.ts  CV ingestion (PDF via unpdf, DOCX via mammoth, text)
  cvtext.ts   reading CV text: parseHeader (name/contact/headline block), reflow PDF line wraps, heading/bullet/role lines
  cvformat.ts learnFormat(): a DocFormat read from the person's own .docx (font, sizes, colours, header order, headings, page)
  evidence.ts which of the candidate's own lines/stories back a requirement (shared by drafter + gap suggestions)
  gapsuggest.ts suggestGaps(): per-gap tip, pre-fill and options from CV, confirmed stories and earlier gap answers
  fonts.ts    findFontFiles(): a learned font's TTF/OTF on this machine, embedded in PDFs (ligatures off — ATS text layer)
  experience.ts experience bank: imports (CV, LinkedIn ZIP via node:zlib, GitHub API, a public link), quick-add
              structuring, bankText()/groundTruth() — what drafts, profile_get and the honesty check read
  config.ts   ~/.callback/config.json (0600): apiKey, candidateProfile, profileSource
  models.ts   role → model (orchestrator opus-5-5, writer sonnet-5-5, extractor haiku-5-5)
src/tui/      Ink terminal UI (talks to the server over HTTP + SSE parsed from fetch — Node has no EventSource)
web/          Vite + React dashboard (views: pipeline, interview, experience, activity, memory, settings)
skills/       portable Agent Skills (= the plugin's skills): jd-analyzer, resume-tailor, cover-letter,
              mock-interview, retro, setup, apply, outcome, story
.claude-plugin/plugin.json  plugin manifest (repo root = plugin root)
docs/index.html  landing page (GitHub Pages)
```

## Commands

```bash
npm install
npm run dev            # server (tsx watch, :4317) + Vite dashboard (:5317, proxies /api and /events)
node bin/callback.mjs  # production-style: builds dist/web if missing, serves on :4317, opens browser
node bin/callback.mjs tui
npm run typecheck      # tsc --noEmit (TypeScript 7; must stay clean)
npm run build          # vite build + esbuild bundles → dist/
npm pack               # runs typecheck + build; tarball ships bin, dist, skills, .claude-plugin only
claude --plugin-dir .  # use inside Claude Code (needs /opt/homebrew/bin on PATH)
claude plugin validate .
```

## Testing (no test framework yet — scripted end-to-end against a fresh data dir)

Start a throwaway server and drive the HTTP API in demo mode:

```bash
CALLBACK_HOME=/tmp/cb-test CALLBACK_DEMO=1 CALLBACK_PORT=4399 node bin/callback.mjs serve
```

Then: upload a profile (`POST /api/profile/upload`), create an application (`POST /api/applications`,
`tailor: true`), wait for approvals (`GET /api/approvals`, resolve with `POST /api/approvals/:id`),
read the run events (`GET /api/runs/:id/events`), check `GET /api/applications/:id` (artifacts,
materials, interviews, drills), run `POST /api/artifacts/:id/ats` and `GET …/download?format=pdf`.
Never test against the real `~/.callback`. `CALLBACK_PREFER_DIST=1` makes the launcher run the
bundled `dist/` even in a checkout. Use a different port per concurrent test server.

## Conventions and gotchas

- Types first: change `src/shared/types.ts`, then server, then web/TUI. `@shared/*` is a tsconfig
  path alias (`./src/shared/*`) — tsx, Vite (alias) and esbuild all resolve it; tsconfig has no `baseUrl`.
- DB migrations are additive `ALTER TABLE … ADD COLUMN` in try/catch at the end of `initDb()`.
- `Application.materials` (resume/coverLetter/prep/interviews/avgInterviewScore/drillsDue) is computed
  per row in `materialsFor()`; interview sessions carry the pipeline `stage` they were practiced at.
- Agent SDK: there is **no** `maxBudgetUsd` option; bound runs with `maxTurns` and read
  `result.total_cost_usd`. `canUseTool` returns `{behavior:'allow', updatedInput}` or `{behavior:'deny', message}`.
- Approvals: only writes need sign-off (`save_draft` except `interview_prep`, `artifact_update`).
  Reads and `save_jd_analysis` are auto-allowed.
- Memory notes: `proposed | active | retired`; agents search ACTIVE notes and only ever *propose*.
- Document format: `config.json` → `docFormat` (`getDocFormat()` fills defaults; invalid values keep the stored
  one). Renderers take `style`; the default header is name → contact line → bold headline; `headerOrder: 'auto'` keeps the
  draft's own order, and the drafter then keeps the CV's
  (`parseHeader()` in cvtext.ts reads name / headline / contact as a block — never through `reflow()`).
- Gap answers: everything typed into a gap is stored in `gap_answers` with its `gapKind()` (shared/placeholders.ts).
  Standing kinds (availability, name, contact) are reused as is — the drafter fills them in; experience kinds
  pre-fill only on a strong match with a real number; openings are never reused (only real company connections).
- Experience bank: `proposed | active | archived`. Imports and agent saves arrive `proposed`; only `active`
  entries reach drafts (`groundTruth()` = profile text + active bank). Anything the human typed is theirs, so it
  saves `active`. Imports dedupe on kind + title + org, including archived entries (a discard sticks).
  Weakness notes are scoped `stage:<mode>` with `tags = [dimensionKey]`.
- Hono `serveStatic` roots are cwd-relative, so the launcher always spawns the server with `cwd = repo root`.
- Node ≥ 22.13 (unflagged `node:sqlite`). `NODE_OPTIONS=--disable-warning=ExperimentalWarning` is set by the launcher.
- Ports: server 4317, Vite 5317. Demo keyword/STOP lists live in `engine.ts` and `resume.ts`.
- Don't `console.log` in `src/mcp-stdio.ts` — stdout is the MCP channel; use stderr.

## Git rules (from the owner)

- Commit **only** when explicitly asked, after reviewing together what goes in.
- Commit messages: plain, no `Co-Authored-By` or other attribution trailers.
- Remote: https://github.com/nomadicmehul/Callback (`origin`). Never commit `~/.callback` data or `.env`.
- Never work directly on `main`. Every change gets its own branch, merged back via PR.

### Branch naming

`<type>/<short-kebab-description>` — lowercase, hyphens, no spaces, optionally an issue number
(`bugfix/42-ats-date-parse`). One topic per branch.

| Prefix | Use for | Branches from → merges to |
|---|---|---|
| `features/` | new functionality (`features/voice-answers`) | `main` → `main` |
| `bugfix/` | non-urgent bug fixes (`bugfix/drill-due-date`) | `main` → `main` |
| `hotfix/` | urgent fix for a released/published version (`hotfix/export-crash`) | release tag → `main` (+ new patch release) |
| `refactor/` | restructuring with no behavior change | `main` → `main` |
| `docs/` | README, CLAUDE.md, landing page, skills text only | `main` → `main` |
| `chore/` | deps, build, tooling, CI, config | `main` → `main` |
| `test/` | test scripts / fixtures only | `main` → `main` |
| `release/` | preparing a version (`release/0.2.0`): version bump, changelog | `main` → `main` + tag `v0.2.0` |

### Commit messages

Conventional Commits, matching the branch type: `feat: …`, `fix: …` (bugfix and hotfix), `refactor: …`,
`docs: …`, `chore: …`, `test: …`. Optional scope: `feat(interview): voice dictation for answers`.
Imperative mood, ≤ 72-char subject, body explains *why* when it isn't obvious. Still no attribution trailers.

## Status and what's next

Built and verified in demo mode: thin slice, dashboard + TUI, profile ingestion, plugin mode, URL
capture + posting guard + structured extraction (company/role/location), outcome → retro, interview
module (mock interviews, scoring, weakness memory, drills, prep packs), PDF/DOCX export + ATS check,
per-job resume + cover letter, per-job interview traceability, npm packaging (`callback-agent`), house-format
export + suggestions, gap filler, experience bank (imports, quick add, story-backed drafts, plugin tools).

Experience bank, round two: coverage across tracked jobs ("3 of your 5 targets ask for X — no story yet") and
project suggestions; live-driver structuring of quick-add text; drafts that pick stories per role archetype.

Next, in rough order:
1. **Live-key test** of the `claude` driver end to end (tailor → ATS loop → cover letter → interview → retro),
   then Haiku/Sonnet subagent routing for the analysis step.
2. Publish `callback-agent` to npm; enable GitHub Pages from `docs/`; plugin icon (512px PNG) + `marketplace.json`.
3. Draft diff view for agent revisions; TUI parity for interviews/exports; delete/archive applications.
4. Optional: sanctioned job-source integrations (official APIs only — never scraping or auto-apply).
