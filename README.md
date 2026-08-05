# AI Test Automation Tool (Playwright MCP + Claude)

Enter a URL, then chat in plain English -- "generate test cases for the login page",
"test an invalid password", "check if checkout works" -- and this tool inspects the real
page with [Playwright MCP](https://github.com/microsoft/playwright-mcp), generates
structured test cases, executes them in a real browser, and shows you steps,
screenshots, logs, failures, and suggested fixes. Approve/edit test cases in chat or in
a form editor, rerun failed runs, and export any test case as a standalone Playwright
script.

Requires signing in (see [Setup](#setup)); supports multiple named environments
(dev/qa/staging/prod) with per-environment browser/viewport config and encrypted
credentials, self-healing selectors with a review/approval workflow, console/network
log capture, a per-project reporting dashboard, batched "run all" execution, a CI/CD
export path (standalone spec zip, CLI runner, JUnit/HTML reports, GitHub Actions
sample), real push integrations for Jira, GitHub Issues, and Azure DevOps, real
trace/video capture, storage-state carryover ("continue from chat session" and "rerun
from step N"), webhook/Slack failure notifications, CSV/JSON data-driven runs with
secret-column masking, reusable versioned flows, visual regression testing (baseline
screenshots, pixel-diffing, approve/reject), and per-project RBAC + an audit log
(owner/editor/viewer membership, see Auth below) -- see
[What's in Phase 2](#whats-in-phase-2) below. A smaller backlog (multi-source test
import from Excel/JIRA/Playwright scripts and a redesigned SaaS UI) is intentionally
not built yet -- see [Roadmap](#roadmap).

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

- **Frontend**: Next.js (App Router) + React. URL/project intake, chat panel, test case
  list/editor, run dashboard with screenshots and logs.
- **Backend**: Node.js/TypeScript, Express (REST) + `ws` (WebSocket for chat streaming
  and live execution progress).
- **Agent layer**: `packages/backend/src/agent` -- a manual Claude tool-use loop. Tools
  available to the model are the *live* Playwright MCP tool list (`browser_navigate`,
  `browser_snapshot`, `browser_click`, ...) plus two custom, backend-only tools
  (`propose_test_cases`, `update_test_case`) that persist structured test cases instead
  of being sent to the browser.
- **MCP layer**: `packages/backend/src/mcp` -- spawns and manages one Playwright MCP
  child-process session per project (chat/exploration) or per test run (execution),
  using `@modelcontextprotocol/sdk`'s stdio client transport.
- **Execution engine**: `packages/backend/src/execution` -- replays a test case's steps
  against a fresh, isolated MCP browser session. Selectors are never hardcoded: each
  step stores a resilient descriptor (role+name, label, placeholder, text, or
  data-testid, with CSS only as a last resort); at run time the executor takes a fresh
  accessibility snapshot and re-resolves the descriptor, asking Claude to pick the
  closest match if the page changed slightly (recorded as "selector auto-recovered").
  On failure, it asks Claude for a plain-language explanation and a suggested fix.
- **Exporter**: deterministically compiles a saved test case into a runnable
  `@playwright/test` `.spec.ts` file using the same resilient locators -- no LLM call
  needed for export.
- **Storage**: SQLite via Prisma by default (zero config). Swap to Postgres by changing
  `datasource.provider` in `packages/backend/prisma/schema.prisma` to `"postgresql"` and
  pointing `DATABASE_URL` at your Postgres instance -- no model changes required.
- **Cost tracking**: every Anthropic API call tied to a project -- chat-turn
  generation, failure explanation, and selector recovery -- records its token usage
  (input, output, cache read, cache write) and an estimated USD cost in the
  `TokenUsage` table (`packages/backend/src/db/usageRepo.ts`), tagged by `source`
  (`chat` | `failure_explanation` | `selector_recovery`). Chat-turn usage is broadcast
  live over the WebSocket (`usage.update`); the project page shows a running total
  above the chat panel. Per-model rates live in `packages/backend/src/agent/pricing.ts`
  as editable constants -- they follow Anthropic's published tiering pattern but are
  estimates; verify against https://www.anthropic.com/pricing if you need
  billing-exact figures.
- **Auth**: a login gate (`packages/backend/src/auth`) -- scrypt-hashed passwords,
  server-side sessions (httpOnly cookie). Every REST route and the WebSocket upgrade
  both require a valid session. Every user has a site-wide `role` (`admin` | `member`);
  an admin can add teammates and manage roles from `/admin`
  (`packages/frontend/app/admin/page.tsx`) and always has full access to every project
  (see per-project RBAC below).
- **Per-project RBAC + audit log**: a `ProjectMember` row (`packages/backend/src/db/projectMemberRepo.ts`)
  grants a user one of `owner` / `editor` / `viewer` on a specific project -- `owner`
  manages membership and credentials (environment secrets, integration tokens),
  `editor` creates/edits/runs/deletes test cases/environments/flows, `viewer` is
  read-only but can still run tests. A global admin bypasses membership entirely and is
  always treated as `owner`. `projectsRouter.param("id", ...)` (`src/routes/projects.ts`)
  is the shared gate for every `/api/projects/:id/...` route -- 403s with "not a member"
  if the requester has no `ProjectMember` row, then individual routes layer an extra
  `editor`/`owner` check where they need more than bare read access; `testcases.ts`'s
  core GET/PUT/DELETE and `environments.ts`'s credential routes do the same after an
  extra lookup for their parent project id. Membership is managed at
  `/project/:id/members`; every security-relevant action (project create, membership
  add/role-change/remove, environment credential updates, integration config updates,
  test case deletion) is recorded to a durable `AuditLogEntry`, browsable at
  `/project/:id/audit-log`. Projects/users that existed before this feature were
  backfilled with `owner` `ProjectMember` rows (via the introducing migration) so
  nothing already using the app lost access; only a project's creator is auto-added
  going forward -- everyone else needs an explicit invite. See
  [Known limitations](#known-limitations) for which routes this coverage doesn't
  reach yet.
- **Test case ownership + change requests**: the user who created a test case (via chat
  or the editor) is its owner (`TestCase.createdById`); only the owner or an admin can
  edit or delete it. Anyone else can still view and run it, and can flag an issue via
  "Request changes", which creates a durable `ChangeRequest` (same pattern as
  `HealingEvent`: a reviewable queue, not an email/push notification) that shows up on
  the test case and on the project dashboard until the owner or an admin resolves it.
- **Environments**: `packages/backend/src/db/environmentRepo.ts` -- named per-project
  environments (dev/qa/staging/prod or any label) with their own base URL, browser,
  headless/viewport config, and encrypted credentials (AES-256-GCM,
  `packages/backend/src/utils/crypto.ts`). Credentials are never returned by any API
  response (only a `hasCredentials` flag); a step can reference them with
  `{{env.KEY}}` placeholders, substituted server-side right before the MCP tool call so
  secrets never pass through chat/LLM context.
- **Self-healing**: `resolveElement` (`packages/backend/src/execution/selectorResolution.ts`)
  tries, in order: the primary selector, previously-approved alternate locators
  (`TestStep.locatorCandidates`), a raw CSS/XPath check via `browser_evaluate`, then
  LLM-assisted recovery as a last resort. Anything beyond the primary+candidates creates
  a `HealingEvent` (old/new selector, confidence, screenshot) that sits in a review queue
  (`/project/:id/healing`) until a human approves it -- nothing is applied permanently
  without that approval.
- **Reporting dashboard**: `GET /api/projects/:id/dashboard` computes totals, recent
  runs, pass/fail/skip counts, a flaky-test heuristic, average duration, and a release-
  readiness score on read from existing run data -- no separate analytics tables.
- **Real trace/video capture**: `packages/backend/src/execution/traceCapture.ts` starts
  Playwright MCP's trace/video recording (`browser_start_tracing`/`browser_start_video`,
  gated behind the `devtools` MCP capability, which `mcpManager.ts` always enables) at
  the start of a run and stops it at the end, locating the resulting `.trace`/`.webm`
  file inside that run's own `--output-dir` and storing it on `TestRun.tracePath`/
  `videoPath` (served at `/artifacts/*`). Best-effort throughout -- a browser/session
  that doesn't support it just leaves those fields null, and the Trace tab falls back to
  its reconstructed timeline.
- **Storage-state carryover** (`packages/backend/src/execution/storageState.ts`): after
  every passing step, the session's cookies/localStorage and current URL are captured
  (best-effort, via `browser_storage_state`) onto that step's `TestRunResult`. Two
  features build on this:
  - **"Continue from chat session"** -- an opt-in checkbox when starting a run seeds the
    fresh execution session with the project's live chat-exploration session's storage
    state before the first step (e.g. skip re-login if chat already authenticated).
  - **"Rerun from step N"** (the "↻ rerun from here" button on a run's step list) --
    steps before N are not re-executed; the new run's session is instead seeded with the
    state captured after step N-1 and navigated back to that URL. The inherited steps
    are shown in the UI as "inherited from run #X, not re-verified this run", never as a
    fabricated pass/fail for steps that didn't actually run again.
- **Webhook notification**: if `WEBHOOK_URL` is set, `packages/backend/src/execution/webhookNotifier.ts`
  POSTs a JSON payload (with a top-level `text` field, so it doubles as a Slack incoming
  webhook URL) whenever a run finishes with a non-passed status. Unset by default -- no
  request is made at all unless configured.
- **Structured test data**: a `TestDataSet` (`packages/backend/src/db/testDataSetRepo.ts`)
  is a CSV/JSON-imported table attached to one test case (uploaded/edited from the test
  case editor's "Test data" card). A step's value references a column with
  `{{data.COLUMN}}`, resolved per-row at execution time the same way `{{env.KEY}}`
  resolves credentials (`packages/backend/src/execution/testDataParser.ts` for
  parsing). "Run with data" (`POST /api/testcases/:id/run-with-data`) executes the test
  case once per row, each producing its own `TestRun` tagged with `dataRowIndex`,
  sharing a batchId like "Run all". Columns flagged secret at upload time are masked
  (`••••••`) everywhere a step's value would otherwise be echoed back -- in a run's
  stored/returned `actualResult` text (`maskedDisplayValue` in `executor.ts`) and in an
  exported spec, where a secret column becomes a `process.env.DATA_SECRET_<row>_<COLUMN>`
  reference instead of a literal (`exporter.ts`'s `dataArrayLines`) -- while the real
  value is still used for the live browser action / real execution. The same masking now
  also covers `{{env.KEY}}` credentials in run-result text, closing a gap where a
  substituted credential value previously appeared in plaintext in a stored
  `TestRunResult.actualResult`. Out of scope for this pass: screenshots of a visible
  (non-password-type) field holding a secret value aren't redacted -- only text output is.
- **Reusable, versioned flows**: a `Flow` (`packages/backend/src/db/flowRepo.ts`,
  `/project/:id/flows`) is a named step sequence (e.g. "Login as standard user")
  editable independently of any test case. "Insert flow" materializes its current
  version's steps into a test case as normal, concrete `TestStep` rows tagged with
  `sourceFlowVersionId` for provenance -- the executor/exporter have no idea flows
  exist. Editing a flow creates a new immutable `FlowVersion` rather than mutating the
  one a test case already inserted, so nothing about an existing test case changes
  silently; the editor instead shows "a newer version is available" and only applies
  the update (`POST /api/testcases/:id/steps/update-flow-block`) on an explicit click,
  the same "nothing changes without a human action" pattern as `HealingEvent`/
  `ChangeRequest` approval.
- **Visual regression**: an `assertVisualMatch` step (`packages/backend/src/execution/visualRegression.ts`)
  pixel-diffs its screenshot against a `VisualBaseline` using `pixelmatch`/`pngjs` (the
  same pure-JS diffing approach Playwright itself uses internally). No baseline yet ->
  this screenshot becomes the baseline (passes). A diff beyond the threshold (global
  `VISUAL_DIFF_THRESHOLD_PERCENT` default, overridable per-step via `value`) fails the
  step and creates a pending `VisualDiff` -- baseline/actual/diff images reviewable at
  `/project/:id/visual-regression`, same "nothing applied without an explicit action"
  pattern as `HealingEvent`: approving promotes the actual screenshot to the new
  baseline, rejecting leaves the baseline untouched. Not ported to the standalone
  export (baselines live in this app's own storage) -- the exported spec instead
  captures a plain screenshot with a comment explaining the gap.
- **Issue-tracker push (Jira, GitHub Issues, Azure DevOps)**: all three declared
  `IntegrationType`s now have real adapters (`src/integrations/{jira,github,azureDevOps}Adapter.ts`),
  each built against that API's documented contract (Jira Cloud REST v3 Basic auth;
  GitHub REST Bearer-token `POST /repos/{owner}/{repo}/issues`; Azure DevOps Work Item
  Tracking REST, PAT Basic auth, JSON Patch body). `POST /api/testruns/:id/push-to/:type`
  replaces the old Jira-only route; a run's `issuePushes` array holds one entry per
  tracker type it's been pushed to (`IssuePush` -- physically still the `JiraPush`
  table via `@@map`, predates multi-tracker support). Jira's adapter has been
  live-verified against a real account; GitHub Issues and Azure DevOps have been
  smoke-tested against their real APIs with intentionally-invalid credentials
  (confirmed a real, correctly-parsed `401`/error response, proving the request
  shape is right) but not yet exercised end-to-end against a live account/PAT.
  `mockAdapter.ts` remains as the fallback for any future `IntegrationType` added
  before its real adapter lands, so the interface stays provably extensible without
  ever silently faking a push.

## Data model

`Project` -> `TargetUrl` -> `TestCase` -> `TestStep`, `TestCase` -> `TestDataSet` (one
CSV/JSON-imported data table per test case, for data-driven runs), `Project` -> `Flow`
-> `FlowVersion` (immutable, referenced from a `TestStep.sourceFlowVersionId` for
provenance), `TestStep` -> `VisualBaseline` (the current accepted-appearance screenshot
for an `assertVisualMatch` step) with `TestStep`/`TestRunResult` -> `VisualDiff`
(pending/approved/rejected pixel-diff review), and `TestCase` -> `TestRun` ->
`TestRunResult` -> `Screenshot`, plus `ExecutionLog` (tagged
`execution`/`console`/`network`), `ChatMessage` (chat history per project),
`TokenUsage` (one row per Anthropic API call, for cost tracking), `Environment`
(per-project execution config + encrypted credentials), `HealingEvent`
(pending/approved selector-recovery review), `ChangeRequest` (pending/resolved "please
fix this" flags on a test case), `Project` -> `ProjectMember` (per-user
owner/editor/viewer role) and `AuditLogEntry` (who did what), and `User`/`Session`
(login + site-wide role). See `packages/backend/prisma/schema.prisma` for the full
schema.

## What's in Phase 2

Beyond the original MVP (chat-driven generation, execution, screenshots, failure
explanation, export), this phase added:

1. **Project & environment management** -- multiple named environments per project,
   each with its own base URL, browser/headless/viewport, and encrypted credentials;
   switchable before chatting or running.
2. **Richer NLP generation** -- `accessibility` and `edgeCase` test types, and explicit
   handling of pasted user stories/acceptance criteria (one test case per criterion).
3. **Richer execution** -- console + network log capture, a structured "trace bundle"
   endpoint (`GET /api/testruns/:id/trace`), and batched `POST
   /api/projects/:id/testcases/run-all` with a concurrency cap (`MAX_PARALLEL_RUNS`).
4. **Low-code editor upgrades** -- enable/disable a step, duplicate, reorder, and a
   "generate step from instruction" quick-add that inspects the live page.
5. **Full self-healing workflow** -- alternate locator candidates, alt-text/XPath
   strategies, and a durable approve/dismiss review queue (see above).
6. **Reporting dashboard** -- `/project/:id/dashboard`.
7. **Minimal auth** -- see above.

## Setup

Prerequisites: Node.js 20+, an [Anthropic API key](https://console.anthropic.com/).

```bash
npm install
cp .env.example packages/backend/.env    # then fill in the values below
npx playwright install                   # installs browser binaries used by Playwright MCP

npm run prisma:generate
npm run prisma:migrate        # creates packages/backend/prisma/dev.db
npm run seed                  # creates the admin login + seeds a demo project
```

In `packages/backend/.env`, set:
- `ANTHROPIC_API_KEY` -- your key.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` -- the account `npm run seed` creates. Only takes
  effect the *first* time you seed (when no `User` rows exist yet); there's no
  change-password UI yet, so to reset, delete the `User` row and re-run the seed.
- `CREDENTIAL_ENCRYPTION_KEY` -- required before you can save environment credentials.
  Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

> The backend reads its `.env` from `packages/backend/.env` (that's its working directory
> when run via the npm workspace scripts) -- not the repo root. The frontend doesn't need
> its own `.env`; `NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_WS_BASE_URL` already default to
> `localhost:4000`. Only add `packages/frontend/.env.local` if you're pointing the UI at a
> non-default backend host.

## Run

In two terminals:

```bash
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

Open http://localhost:3000, sign in with the admin account you seeded, create a project
with a target URL, and start chatting. See [`PLAYBOOK.md`](./PLAYBOOK.md) for a full
usage guide (dashboard, self-healing, environments, ownership/team) and
[`docs/sample-test-flows.md`](./docs/sample-test-flows.md) for a worked example against
a public demo site.

## Configuration

All backend settings are environment variables (see `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | -- | required |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Cheaper/faster, good default for high-volume test generation and execution (roughly 1/8th the per-token cost of opus). Switch to `claude-opus-4-8` for the most capable model on complex flows, or `claude-haiku-4-5` for the lowest cost on simple flows. |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite by default; swap to a Postgres URL + schema provider change for production |
| `PLAYWRIGHT_HEADLESS` | `true` | set to `false` to watch the browser live while the agent works (global default; per-environment override in Environments settings) |
| `PLAYWRIGHT_BROWSER` | `chromium` | `chromium` \| `firefox` \| `webkit` (global default; per-environment override in Environments settings) |
| `SCREENSHOTS_DIR` | `./data/screenshots` | served at `/screenshots/*` by the backend |
| `ARTIFACTS_DIR` | `./data/mcp-artifacts` | per-session Playwright MCP trace/video/storage-state files; served at `/artifacts/*` |
| `WEBHOOK_URL` | -- | optional; POSTed (with a `text` field, so it doubles as a Slack incoming webhook URL) whenever a run finishes non-passed |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | the only origin allowed to call the API with credentials (cookies) -- must match exactly where the frontend is served |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / -- | seeded login account; required the first time you run `npm run seed` |
| `CREDENTIAL_ENCRYPTION_KEY` | -- | required to save environment credentials; see generation command above |
| `MAX_PARALLEL_RUNS` | `3` | concurrency cap for "Run all" |

## Project structure

```
packages/
  shared/    # types shared by frontend + backend (TestCase, TestStep, WS protocol)
  backend/   # Express API, WebSocket server, agent, MCP client, execution engine
  frontend/  # Next.js UI
```

Key backend modules, in the order a request flows through them:

```
src/auth/                     login gate: password hashing, sessions, Express + WS middleware
src/ws/wsServer.ts             entry point for chat + run commands over WebSocket (auth-gated)
src/agent/agentService.ts     Claude tool-use loop (chat) + one-shot calls (failure
                               explanation, selector recovery, step-from-instruction)
src/agent/systemPrompt.ts     agent persona + selector/tool-call instructions
src/agent/customTools.ts      propose_test_cases / update_test_case tool schemas
src/mcp/mcpManager.ts         spawns & pools Playwright MCP sessions (per-session
                               browser/headless/viewport override for environments)
src/mcp/toolConversion.ts     MCP tool schema <-> Anthropic tool schema
src/execution/executor.ts     replays a TestCase's steps against a live MCP session;
                               resolves environment config + `{{env.*}}` credential
                               substitution; records healing events; captures diagnostics
src/execution/selectorResolution.ts  resilient selector -> live element ref: primary ->
                               stored candidates -> CSS/XPath -> LLM-assisted recovery
src/execution/diagnostics.ts  console/network log capture via Playwright MCP
src/execution/exporter.ts     TestCase -> standalone @playwright/test script
src/db/environmentRepo.ts     environment CRUD + credential encryption/decryption
src/db/healingRepo.ts         healing-event creation + approve/dismiss
src/db/dashboardRepo.ts       per-project metrics aggregation (read-only, no extra tables)
```

## Verifying your setup without spending API credits

```bash
npm run typecheck   # tsc --noEmit across shared/backend/frontend
npx prisma validate --schema packages/backend/prisma/schema.prisma
```

## CI/CD

The exported `.spec.ts` files are plain `@playwright/test` specs -- drop them into any
existing Playwright project and run `npx playwright test` in CI as usual. Beyond a
single-test export, this is already wired up end to end:

- `GET /:id/export-ci` (`packages/backend/src/execution/ciExporter.ts`) zips *all*
  approved test cases in a project as one Playwright project directory --
  `playwright.config.ts`, every exported spec, a `package.json`, a README listing
  required env vars, and a ready-to-use GitHub Actions workflow -- for download from the
  project page ("Export CI package").
- `npm run ci:run-tests --workspace packages/backend` (`src/cli/run-tests.ts`) is a
  standalone CLI that logs in, triggers "run all", waits for the batch, fetches the
  JUnit report, writes `junit-results.xml`, and exits non-zero on any failure -- the same
  command the generated `.github/workflows/playwright.yml` sample invokes on a
  schedule/PR.
- `GET /testruns/batch/:batchId/junit` and `.../html` (`junitReport.ts` /
  `htmlReport.ts`) turn a "Run all" batch into a JUnit XML report or a standalone HTML
  report, respectively.

A webhook/Slack notification on `run.completed` with `status !== "passed"` is now built
-- see `WEBHOOK_URL` above.

## Known limitations

- The chat agent and the test executor each use their own isolated Playwright MCP
  browser session by default (keyed by project id for chat, by test-run id for
  execution). Opt in to carrying state over with the "continue from chat session"
  checkbox at run-start time -- see above; without it, a run does not reuse whatever
  state the chat exploration session was in.
- The exporter maps `role`/`label`/`placeholder`/`text`/`altText`/`testId`/`css`/`xpath`
  selector descriptors to their corresponding `page.getBy...()`/`page.locator()` call; it
  does not (yet) resolve ambiguous locators (e.g. two elements with the same role+name)
  at export time -- it now emits a comment flagging `text`/`css`/`xpath` locators (the
  strategies with no built-in uniqueness guarantee) as worth reviewing, but still relies
  on Playwright's own strict-mode-violation error at run time to catch an actual
  collision, rather than resolving it up front.
- **Trace/video capture depends on the `devtools` Playwright MCP capability** being
  supported by the session's browser/environment -- when it isn't, `tracePath`/
  `videoPath` stay null and the Trace tab falls back to its reconstructed timeline
  (step results + screenshots + console/network logs), same as before this existed.
- **Per-project RBAC enforcement doesn't reach every route yet**: `projects.ts`
  (project-scoped routes), `testcases.ts`'s core GET/PUT/DELETE, and
  `environments.ts`'s credential routes check `ProjectMember` role; `testcases.ts`'s
  narrower sub-routes (data set, step-generation, flow insertion, run-with-data),
  `flows.ts` (`/api/flows/:flowId`), `healingEvents.ts`, `visualDiffs.ts`, and
  `changeRequests.ts` don't yet re-check project membership on top of the base
  "any logged-in user" gate -- someone who knows/guesses an id for a resource in a
  project they're not a member of can still reach these narrower endpoints. Closing
  that gap fully means threading a project-id lookup through each of them the same
  way `environments.ts` does today.
- **"Rerun from step N" only restores browser storage state (cookies/localStorage) +
  the last URL, not full page/app state** (in-memory JS state, unsaved form input,
  server-side session data tied to more than a cookie) -- for flows sensitive to that,
  a full rerun from step 1 is still more reliable.

## Roadmap

Deliberately not built in this phase (see `docs/` or ask for the full gap-analysis plan
if you want the detailed breakdown):

- **Multi-source test generation**: importing existing test cases from Excel, JIRA
  stories, or existing Playwright scripts, merging/de-duplicating against what's already
  in the project, and a requirement-to-test traceability matrix.
- **Full SaaS UI redesign**: sidebar navigation, guided onboarding stepper, drag-and-drop
  step editor, visual diff viewer, toasts/skeletons/empty-states, dark/light toggle.
  The current UI is intentionally plain/functional rather than a polished product shell.
