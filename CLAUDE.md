# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First-time setup

```bash
npm install
cp .env.example packages/backend/.env    # backend reads its .env from here, not the repo root
npx playwright install                   # browser binaries used by Playwright MCP
npm run prisma:generate
npm run prisma:migrate                   # creates packages/backend/prisma/dev.db
npm run seed                             # creates the ADMIN_USERNAME/ADMIN_PASSWORD login + a demo project
```

Required in `packages/backend/.env`: `ANTHROPIC_API_KEY`, `ADMIN_USERNAME`/`ADMIN_PASSWORD` (only takes effect the first time you seed — no `User` rows yet), and `CREDENTIAL_ENCRYPTION_KEY` (needed before saving Environment credentials; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Full variable list + defaults: `.env.example` / README > Configuration.

## Commands

Root is an npm workspace (`packages/shared`, `packages/backend`, `packages/frontend`). Run these from the repo root:

```bash
npm install
npm run dev:backend        # tsx watch, http://localhost:4000 (reads packages/backend/.env, NOT root .env)
npm run dev:frontend       # next dev, http://localhost:3000
npm run build              # builds shared -> backend -> frontend, in that order (shared must build first, backend/frontend import its dist)
npm run typecheck          # tsc --noEmit across all three packages -- the primary correctness check, run after any change
npm run prisma:generate    # regenerate Prisma client after schema.prisma changes
npm run prisma:migrate     # npx prisma migrate dev --name init (edit the --name inline if you need a custom migration name)
npm run seed               # creates the admin login (ADMIN_USERNAME/ADMIN_PASSWORD) + a demo project
npm run ci:run-tests --workspace packages/backend   # tsx src/cli/run-tests.ts -- standalone CLI runner behind `Export CI package`
```

There is no test suite (no test runner configured) and no lint script — `npm run typecheck` is the only automated check. Verify behavior via `npx prisma validate --schema packages/backend/prisma/schema.prisma` for schema changes, and live curl/manual checks against the running dev servers for everything else.

To work on a single package directly: `npm run <script> --workspace packages/<shared|backend|frontend>`.

### Windows-specific gotchas

- `prisma generate`/`prisma migrate dev` will fail with `EPERM: ... query_engine-windows.dll.node.tmp` if the backend dev server (`tsx watch`) is currently running, since it holds the native query engine DLL open. Find and stop it first: `Get-NetTCPConnection -LocalPort 4000 -State Listen` → `Stop-Process -Id <pid> -Force`, then regenerate, then restart `npm run dev:backend`.
- After deleting/renaming a Next.js route file, a stale `packages/frontend/.next/types/...` cache can cause a spurious typecheck failure. Stop the frontend dev server (`Get-NetTCPConnection -LocalPort 3000 -State Listen` → `Stop-Process`), delete `packages/frontend/.next`, restart `npm run dev:frontend`, and re-typecheck.

## Architecture

```
Next.js UI  <-- REST -->  Express API  <-- Anthropic SDK -->  Claude (tool-use agent)
    |                          |                                     |
    +---- WebSocket (chat +----+                                     |
          execution progress)  |                                     v
                                +--> MCP client (@modelcontextprotocol/sdk)
                                          |
                                          v
                              `npx @playwright/mcp` (real browser)
```

- **`packages/shared`**: types shared by frontend and backend (test case/step shapes, WS protocol messages, dashboard/reports/admin DTOs). Build this first — the other two packages import its compiled `dist`, not its `src`.
- **`packages/backend`**: Express (REST) + `ws` (WebSocket) on port 4000. Reads its `.env` from `packages/backend/.env` (its cwd when run via the npm workspace script) — a root-level `.env` is *not* read.
- **`packages/frontend`**: Next.js 14 App Router + React 18, port 3000. Dark-only theme using CSS custom properties defined in `app/globals.css`, implementing the token/type/color system specified in `DESIGN.md` (no light-theme toggle). A global persistent `Sidebar` (grouped nav: base "Workspace" group + per-project "Overview"/"Workflow"/"Insights"/"Project settings" groups, rendered once pathname matches `/project/:id`) lives in `AuthGuard`, not in a per-route layout.

### Backend request flow (in the order a request/message actually passes through them)

```
src/auth/                      login gate: password hashing (scrypt), sessions, Express + WS middleware
src/auth/projectAccess.ts       roleMeets/requireProjectRole/canReviewTestCases -- per-project
                                 owner/editor/reviewer/viewer gate (see RBAC invariant below)
src/ws/wsServer.ts              entry point for chat + run commands over WebSocket (auth-gated); routes
                                 each outgoing message through either `broadcast` (shared/project-wide:
                                 testcases.proposed/updated, run.progress, run.completed, usage.update)
                                 or `sendToUser` (private: chat.delta/chat.message/agent.activity/error)
                                 -- see the chat-privacy invariant below before adding a new message type
src/ws/broadcastRegistry.ts     one room (socket set) per project, but tracks each socket's userId too,
                                 so `sendToUser` can target one person within a shared room
src/agent/agentService.ts       Claude tool-use loop (chat, one per turnId, cancellable) + one-shot calls
                                 (failure explanation, selector recovery, step-from-instruction); emits +
                                 persists an AgentActivityEvent at every real stage transition
src/agent/systemPrompt.ts       agent persona + selector/tool-call/module-tagging instructions
src/agent/customTools.ts        propose_test_cases / update_test_case tool schemas (backend-only,
                                 persist structured test cases instead of touching the browser)
src/mcp/mcpManager.ts           spawns & pools Playwright MCP child-process sessions, keyed by
                                 `chatSessionKey(projectId, userId)` for chat/exploration (one real
                                 browser per user per project -- never shared, even between two people
                                 chatting on the same project) or by test-run id for execution; always
                                 passes `--caps devtools,storage` (trace/video + storage-state tools)
                                 and a per-session `--output-dir`
src/mcp/toolConversion.ts       MCP tool schema <-> Anthropic tool schema translation
src/execution/executor.ts       replays a TestCase's steps against a fresh, isolated MCP browser
                                 session; resolves environment config + `{{env.*}}`/`{{data.*}}`
                                 substitution server-side (masking secrets in stored/returned text);
                                 records healing events; captures diagnostics, trace/video, and
                                 per-step storage state
src/execution/selectorResolution.ts  resilient selector -> live element ref, in order: primary ->
                                 previously-approved alternate locators -> raw CSS/XPath -> LLM-assisted
                                 recovery (recorded as a HealingEvent, never auto-applied)
src/execution/storageState.ts   captures/restores browser storage state + page URL; backs "continue
                                 from chat session" (run start) and "rerun from step N" (resume)
src/execution/traceCapture.ts   starts/stops Playwright MCP trace+video recording for a run
                                 (best-effort -- null tracePath/videoPath if unsupported)
src/execution/testDataParser.ts CSV/JSON -> TestDataSet rows, for data-driven "run with data"
src/execution/visualRegression.ts  pixelmatch/pngjs diff of an assertVisualMatch screenshot against
                                 its VisualBaseline; creates a pending VisualDiff beyond threshold
src/execution/webhookNotifier.ts   POSTs WEBHOOK_URL (Slack-compatible) on a non-passed run, if set
src/execution/diagnostics.ts    console/network log capture via Playwright MCP
src/execution/exporter.ts       TestCase -> standalone @playwright/test .spec.ts (deterministic, no LLM)
src/execution/ciExporter.ts     zips every approved TestCase's exported spec + playwright.config.ts +
                                 a GitHub Actions workflow, streamed via `archiver` (GET /:id/export-ci)
src/execution/junitReport.ts    a "Run all" batch's results -> JUnit XML (GET /testruns/batch/:batchId/junit)
src/execution/htmlReport.ts     same batch data -> a standalone HTML report (.../batch/:batchId/html)
src/cli/run-tests.ts            standalone CLI (`npm run ci:run-tests`) that replays exported specs outside
                                 the app, for the GitHub Actions workflow ciExporter.ts generates
src/integrations/               IssueTrackerAdapter interface + adapterFactory.ts routing to real
                                 jira/github/azureDevOpsAdapter.ts (all three live-callable against
                                 their real APIs); mockAdapter.ts is only the fallback for a future
                                 declared-but-unimplemented tracker type -- never silently fake a push
src/db/flowRepo.ts              reusable, named, versioned Flows -- editing creates an immutable
                                 FlowVersion, never mutates steps a TestCase already inserted
src/db/testDataSetRepo.ts       one CSV/JSON-imported data table per TestCase, for data-driven runs
src/db/visualDiffRepo.ts        pending/approved/rejected VisualDiff review queue
src/db/projectMemberRepo.ts     per-project owner/editor/reviewer/viewer role CRUD + getEffectiveProjectRole
src/db/chatRepo.ts              always scoped to one (projectId, userId) pair -- there is no
                                 "list every message in this project" query; chat is private per user
src/db/agentActivityRepo.ts     persisted per-turn activity timeline (also scoped to (projectId, userId)),
                                 backing GET /api/projects/:id/agent-activity's refresh-recovery
src/db/auditLogRepo.ts          append-only AuditLogEntry log for security-relevant actions
src/db/*Repo.ts                 one repo module per entity; dashboardRepo/reportsRepo/failingTestsRepo
                                 are read-only aggregations over existing rows, no separate analytics tables
```

Key architectural invariants worth knowing before touching this code:

- **The agent's tool list is dynamic**: it's the *live* Playwright MCP tool set (`browser_navigate`, `browser_snapshot`, `browser_click`, ...) plus the two custom backend tools, converted through `src/mcp/toolConversion.ts`. It is not a hardcoded list.
- **Selectors are never hardcoded CSS by default.** Each test step stores a resilient descriptor (role+name, label, placeholder, text, or data-testid; raw CSS/XPath is a last resort, flagged "brittle" in the UI). `selectorResolution.ts` re-resolves against a fresh accessibility snapshot at run time so tests survive minor markup drift.
- **`TEST_STEP_ACTIONS` (`packages/shared/src/index.ts`) is the single source of truth for step action types** — the agent's generated-step schema, `customToolSchemas.ts`'s `updateTestCaseTool` enum, `executor.ts`'s `runStep` switch, `exporter.ts`'s `stepToCode` switch, and the frontend's step-editor dropdown all derive from it. Adding a new step type (e.g. a new assertion) means extending this array once, then adding the corresponding `runStep`/`stepToCode` case — the enums stay in sync by construction, don't hand-duplicate the list.
- **Credentials and secret test-data columns never reach chat/LLM context.** Environment credentials are AES-256-GCM encrypted at rest (`src/utils/crypto.ts`); API responses only ever expose a `hasCredentials` boolean. A step references a credential as `{{env.KEY}}` and a data-set column as `{{data.COLUMN}}`, both substituted server-side immediately before the MCP tool call. Columns flagged secret at upload time (`TestDataSet.secretColumns`) are masked (`••••••`) everywhere a step's value is echoed back — in stored/returned run-result text (`maskedDisplayValue` in `executor.ts`) and in an exported spec (`process.env.DATA_SECRET_<row>_<COLUMN>` instead of a literal in `exporter.ts`) — while the real value still drives the actual browser action. The same `encryptSecret`/`hasX`-only pattern is reused for `Integration.apiTokenEncrypted`.
- **Self-healing requires human approval.** Anything beyond primary selector + stored candidates produces a `HealingEvent` sitting in a review queue (`/project/:id/healing`) — nothing is applied permanently without an explicit approve action.
- **Per-project RBAC, fully re-checked at every route.** A `ProjectMember` row grants `owner` / `editor` / `reviewer` / `viewer` on a specific project (rank order `viewer < reviewer < editor < owner` for `roleMeets`); a global `admin` bypasses membership entirely and is treated as owner everywhere. `projectsRouter.param("id", ...)` (`src/routes/projects.ts`) is the shared gate for `/api/projects/:id/...`. Every project-scoped route across `testcases.ts` (including its narrower sub-routes -- data set, step-generation, flow insertion, run/run-with-data, export), `environments.ts`, `flows.ts`, `healingEvents.ts`, `visualDiffs.ts`, and `changeRequests.ts` resolves the owning project (directly, or by walking `testStep -> testCase -> projectId` for healing events/visual diffs) and calls `requireProjectRole` before doing anything -- there is no route left that only checks "any logged-in user." When adding a new project-scoped route, follow the same pattern (resolve a project id, then `requireProjectRole`) rather than assuming a parent route's check covers it. `reviewer` sits below `editor` in rank (read/run access, nothing more) but approve/reject on a `TestCase` uses the separate `canReviewTestCases` check instead of rank, since `editor` should not inherit it -- a project's own author can never approve/reject their own test case, even if they also hold reviewer/owner access (`POST /api/testcases/:id/review`). Every security-relevant action (project create, membership add/role-change/remove, credential updates, test case deletion, test case approve/reject) is recorded to `AuditLogEntry`, browsable at `/project/:id/audit-log`. Separately, a global `admin`/`member` role (`User.role`) gates the site-wide `/api/users` list/create/edit routes and the `/admin` page -- unrelated to project roles; when RBAC was first introduced, a one-time migration backfilled every pre-existing (project, user) pair as `owner` so nothing lost access at cutover, so don't assume a project's current membership rows reflect deliberate role assignments without checking.
- **Real-data-only dashboards/reports, and no silent fake success anywhere else either.** `dashboardRepo.ts`/`reportsRepo.ts`/`failingTestsRepo.ts` compute everything (health score, automation coverage %, time-saved estimate, failing-tests-by-priority, coverage-by-module, pass/fail/skip time series) from existing `TestRun`/`TestCase` rows on read — there are no precomputed analytics tables, and no fabricated metrics. `timeSavedEstimate.ts` holds the explicit, documented assumptions (`ASSUMED_MANUAL_MINUTES_PER_TEST`, `ASSUMED_HOURLY_RATE_USD`) behind the one estimate that isn't a direct measurement. Trend deltas that would need historical snapshots we don't keep (e.g. automation-coverage delta) are deliberately left `null` rather than invented. The same invariant governs `src/integrations`: an unconfigured integration fails the push with an honest 400, it never falls back to a fake success; `mockAdapter.ts` (the fallback for any future undeclared tracker type) returns an obviously-labeled `MOCK-N` key precisely so it can't be mistaken for a real push. Follow this pattern for any new metric or integration: derive it from real rows/calls, or omit/label it as an estimate or mock, never fake it.
- **"Durable, human-reviewable record" for any pending/terminal state**, not a push notification: `HealingEvent`, `ChangeRequest`, `IssuePush`, and `VisualDiff` all follow the same shape (a `status` string plus a nullable completion timestamp) sitting in a queryable queue/history rather than firing an ephemeral alert. Reuse this shape for similar future features rather than inventing a new one.
- **"Never mutate, version instead" for Flows.** Editing a `Flow` creates a new immutable `FlowVersion` rather than changing steps a `TestCase` already inserted (tracked via `TestStep.sourceFlowVersionId`); a test case only picks up the new version on an explicit "apply update" action, never silently. Same underlying philosophy as the human-approval pattern above, applied to versioning instead of a pending queue.
- **Cost tracking**: every Anthropic API call tied to a project (chat turn, failure explanation, selector recovery) records token usage + estimated USD cost in `TokenUsage` (`src/db/usageRepo.ts`), tagged by `source`. Chat-turn usage streams live over WS (`usage.update`). Per-model rates are editable constants in `src/agent/pricing.ts`.
- **Chat is private per user; only the test cases it produces are shared.** Two people with access to the same project never see each other's prompts, streamed agent text, or activity timeline (`ChatMessage`/`AgentActivityEvent` are both scoped by `(projectId, userId)`, enforced in the repo layer, not just the UI) -- and never share a browser either, since `mcpManager`'s chat session key includes the userId. What *is* shared: a proposed `TestCase` carries `sourcePrompt` (the literal prompt that produced it), so it documents its own origin without exposing the private conversation that led to it. When adding a new chat-turn WS message type, decide explicitly whether it's private (route through `sendToUser`) or a shared asset update (route through `broadcast`) in `wsServer.ts`'s `chatEmit` -- don't assume broadcasting is safe by default.
- **Agent activity is a durable timeline, not a status string.** Every real stage the agent moves through in a turn (`AGENT_TURN_STAGES` in `packages/shared`: queued/understanding/analyzing/generating_test_cases/completed/waiting_for_user/failed/cancelled) is persisted as an `AgentActivityEvent` and emitted over WS (`agent.activity`), grouped by `turnId`, so a page refresh mid-turn reconstructs the timeline via `GET /api/projects/:id/agent-activity` instead of losing it. Stages are derived honestly from what's actually happening (an MCP tool call, a `propose_test_cases`/`update_test_case` call) -- there's no fake progress bar and no invented "generating script"/"validating" stage, since those aren't real steps in this pipeline (script export is a separate, deterministic, on-demand action). A turn is genuinely cancellable: `cancelChatTurn` aborts the live Anthropic stream via the SDK's `AbortController` and a `cancelRequested` set catches a cancel that lands between model calls.

### Data model

`Project` → `TargetUrl` → `TestCase` (optional `module` tag for coverage grouping; `tags` -- JSON-encoded `string[]` -- for free-form multi-labeling; `sourcePrompt` capturing the chat prompt that produced it; `version` incremented on every edit, `lastModifiedBy` alongside the original `createdBy`) → `TestStep`, `TestCase` → `TestDataSet` (one CSV/JSON-imported data table per test case, for data-driven runs) and → `TestRun` → `TestRunResult` → `Screenshot`, `TestStep` → `VisualBaseline`/`VisualDiff` (current accepted-appearance screenshot + pending/approved/rejected pixel-diff review for `assertVisualMatch` steps), `Project` → `Flow` → `FlowVersion` (immutable, referenced from `TestStep.sourceFlowVersionId` for provenance), plus `ExecutionLog` (tagged `execution`/`console`/`network`), `ChatMessage` and `AgentActivityEvent` (both `@@index([projectId, userId])`, private per user -- see the chat-privacy invariant above), `TokenUsage`, `Environment` (per-project execution config + encrypted credentials), `HealingEvent`, `ChangeRequest`, `Integration` (per-project, per-`type` issue-tracker config — `"jira"` | `"githubIssues"` | `"azureDevOps"`, all three real), `IssuePush` (per-`TestRun`-per-tracker-type push status/result, physically still the `JiraPush` table via `@@map`; a run can be retried after a `failed` push but returns the existing issue instead of duplicating once `pushed`), `Project` → `ProjectMember` (per-user owner/editor/reviewer/viewer role) and `AuditLogEntry` (who did what), and `User`/`Session`. Full schema: `packages/backend/prisma/schema.prisma`.

Two required-column additions to pre-existing tables (`ChatMessage.userId`, `AgentActivityEvent.userId`) had no historical value to backfill from, so their migrations attach existing rows to each project's earliest owner (same reasoning as the RBAC `ProjectMember` backfill above) -- see the migration SQL under `prisma/migrations/*_chat_isolation*` / `*_activity_events_per_user*` if you need the pattern for a similar future required-column addition on SQLite (Prisma can't `ALTER COLUMN` there; it rebuilds the table, and the generated migration needs hand-editing to backfill instead of just failing on non-null rows).

### Frontend structure

- `app/page.tsx` — the project list ("+ New project" wizard); each card has inline rename and a delete confirmation requiring the project's exact name to be typed (`ConfirmModal`'s `confirmText` prop -- reuse this for any other high-blast-radius delete rather than a plain yes/no), both owner-gated (`ProjectRecord.myRole`, now populated for every member in the list response, not just admins).
- `app/project/[id]/page.tsx` — "Test Generation": a Source Requirement box (textarea + plain-text/markdown file upload) that feeds the same chat pipeline (`chat.send` → `agentService` → `propose_test_cases`) as free-typed chat, an `AgentActivityTimeline` panel above it (loads persisted history from `GET /:id/agent-activity` on mount, then appends live `agent.activity` WS events for the current turn), the generated test case list, the AI usage/cost panel, "Run all" (batches a run and surfaces its JUnit/HTML report links), and "Export CI package" (downloads the zip from `ciExporter.ts`).
- `app/project/[id]/dashboard/page.tsx`, `failing-tests/page.tsx`, `reports/page.tsx` — real-data-only views described above; `reports` uses `recharts` (the only charting dependency in the frontend).
- `app/project/[id]/flows/page.tsx` and `flows/[flowId]/page.tsx` — reusable Flow list/editor; shares `components/StepListEditor.tsx` with the test case editor so step-editing UI isn't duplicated.
- `app/project/[id]/visual-regression/page.tsx` — pending `VisualDiff` review queue (approve promotes the screenshot to the new baseline, reject leaves it untouched).
- `app/project/[id]/members/page.tsx`, `audit-log/page.tsx` — per-project RBAC membership management (owner/editor/reviewer/viewer, owner-gated to add/change) and the audit trail. "Add member" is a search picker backed by `GET /:id/available-members` (owner-only; users not already on the project), not a blind username field.
- `app/project/[id]/integrations/page.tsx` — per-project issue-tracker config (owner-editable, read-only status for everyone else); `app/project/[id]/runs/[runId]/page.tsx` has the "Push to Jira/GitHub/Azure DevOps" / "View issue" action for a failed run (gated on `run.issuePushes`) and subscribes to the same project WS room for live `run.progress`/`run.completed`/`healing.detected` updates -- a run started elsewhere no longer lands you on a page frozen at "pending".
- `app/admin/page.tsx` — site-wide user/role management (add a teammate, and edit an existing one's role/password) plus a read-only system-config panel (`GET /api/admin/config`, admin-gated, never returns secret values). The whole page, including `GET /api/users` (the "Everyone with access" list), is admin-only server-side, not just hidden client-side; the sidebar's "Admin" nav link itself is only rendered for `me.role === "admin"`.
- `app/profile/page.tsx` — the signed-in user's own account: avatar/role, every project they're a member of with their role in each, self-service password change (`PUT /api/auth/password`, distinct from the admin-only user edit -- requires the current password, only invalidates *other* sessions), and Log out. Reached via the sidebar's account-card dropdown (click the avatar at the bottom, not an immediate logout).
- `app/help/page.tsx` — static-ish help/docs content with client-side search and scroll-spy TOC; keep its content in sync with actual shipped features rather than aspirational ones.
- `components/icons.tsx` — hand-drawn thin-line SVG icon set (not an icon library dependency); add new icons here in the same `Svg` wrapper style rather than pulling in a package.
- `components/AgentActivityTimeline.tsx` — renders a turn's `AgentActivityEventRecord[]` as a live stage banner + expandable per-event rows; pairs with `lib/useElapsedTime.ts`'s `useTick`/`formatElapsed` (also reused by the run page's "elapsed" display) for the ticking clock.
- `lib/useProjectSocket.ts` — one WS connection per project, auto-reconnecting; both the Test Generation page and the run results page open their own via this hook rather than sharing a connection, since they mount/unmount independently.
- Styling is plain CSS custom properties in `app/globals.css` (tokens like `--bg`, `--surface`, `--accent`, `--accent-2`), not a CSS-in-JS or utility-class framework — match this when adding new UI. Decorative/categorical colors that aren't meant to track a token (e.g. `TYPE_COLORS` in the dashboard, or the help page's per-section category badges) are deliberately left as independent literals — don't force everything through `--accent`/`--accent-2`.

## Design System

Always read DESIGN.md before making any visual or UI decisions — it's the source of truth for colors, typography, spacing, and aesthetic direction, and is already implemented in `globals.css`/`layout.tsx` (fonts via `next/font/google`). The single most important rule: **`--accent` (gold) is reserved exclusively for "this is live/running right now"** (the running-badge pulse, the chat "agent is active" indicator) — never a generic brand/button/decorative color. Generic secondary decoration uses `--accent-2` (quiet blue-gray) instead. Do not deviate from DESIGN.md without explicit user approval. In QA mode, flag any code that doesn't match it.

## Working in this repo

- When implementing a new feature from a design reference (Figma/screenshot/mockup), ground it in data the app actually has. If a reference implies an integration or entity we don't have (a bug tracker, a release/versioning system, multi-tenant org switching), either substitute an honestly-scoped real equivalent or ask, rather than fabricating placeholder data.
- `packages/shared` changes ripple into both other packages' type-checking — run `npm run typecheck` (all three packages) after editing anything in `packages/shared/src/index.ts`.
