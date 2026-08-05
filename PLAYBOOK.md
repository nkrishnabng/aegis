# Playbook: using the AI Test Automation Tool

A practical, task-oriented walkthrough of the product. For architecture/internals see
[README.md](./README.md); for a single worked example against a public demo site see
[docs/sample-test-flows.md](./docs/sample-test-flows.md).

## 1. Sign in

Go to `http://localhost:3000` and sign in with the account your admin gave you (or the
one you seeded with `npm run seed` -- see README > Setup). Everyone with a login can see
every project; there's no per-project membership yet.

## 2. Create a project and point it at a page

From the home page, **+ New project** walks you through: name it, paste the URL you want
to test, then land on that project's workspace. A project can have multiple named
**environments** later (dev/qa/staging/prod) -- see step 7 -- but you only need the one
URL to get started.

## 3. Generate test cases by chatting

Open the project's **Workspace** tab and just describe what you want in plain English:

- "Generate smoke tests for the login page"
- "Test what happens with an invalid password"
- "Here's a user story: [paste it] -- write acceptance-criteria test cases"

The agent inspects the *real* page (via Playwright MCP), and proposes structured test
cases with steps, which appear in the test case list as `draft`. Keep chatting to add
more, or ask it to adjust an existing one -- but note the agent can only edit test cases
it has permission to (see step 6, Ownership).

## 4. Review and edit test cases

Click into any test case to open the editor:

- Edit title/objective/preconditions/expected result/test data directly.
- Steps: drag the `⠿` handle to reorder, duplicate, enable/disable without deleting,
  or type an instruction into "Quick-add a step" and let the agent generate one from the
  live page.
- Each step's selector shows a **resilient**/**brittle** badge -- resilient means it's
  keyed off role/label/text/placeholder/alt-text/test-id (survives page redesigns);
  brittle means it fell back to raw CSS/XPath (more likely to break). Prefer resilient
  where the agent offers a choice.
- Set `status` to `approved` once you're happy with it -- draft test cases still run
  fine, but `approved` is what "Run all" and the release-readiness score are based on.

## 5. Run tests

- **Run** on a single test case (from the list, the editor, or the dashboard table).
- **Run all** (top of the Workspace tab) executes every test case in the project with a
  concurrency cap, tagging the batch so you can see them together.
- Each run opens a live results page: per-step status, screenshots, the plain-language
  failure explanation + suggested fix if something broke, plus **Console**/**Network**/
  **Trace** tabs. (Playwright MCP doesn't expose a native trace/video file today, so
  "Trace" is a reconstructed timeline from step results + logs + screenshots, not a
  literal `.trace.zip`/`.webm`.)
- A failed run can be **rerun** from the same page.

## 6. Ownership and "Request changes"

Whoever creates a test case (via chat or the editor) becomes its **owner**. Only the
owner or an admin can edit or delete it; everyone else can still **view it and run it**.

If you spot a problem in a test case you don't own, don't try to edit it -- click
**Request changes** and describe the issue. That creates a durable, reviewable flag
(the same pattern as self-healing below, not an email): it shows up on the test case
itself and in the **Open change requests** widget on the project dashboard until the
owner (or an admin) marks it resolved.

Test cases created before this feature existed have no recorded owner and stay editable
by anyone, so nothing you had already built gets locked.

## 7. Environments

Environments (**sidebar > Environments**) are what *execution* uses -- separate from the
one URL you chat against. Add one per stage (dev/qa/staging/prod) with its own base URL,
browser (Chromium/Firefox/WebKit), headless/viewport settings, and encrypted credentials.
Reference a credential in a step's value as `{{env.KEY}}` -- it's substituted server-side
right before the action runs, so the secret never passes through chat or the LLM. Pick
the active environment from the switcher in the top bar before running.

## 8. Self-healing

**What it's for:** page markup drifts over time (an id changes, a label gets reworded).
Instead of every run breaking the moment a selector goes stale, the executor tries, in
order: the step's primary selector -> previously-approved alternate locators -> a raw
CSS/XPath check -> asking Claude to find the closest match on a fresh accessibility
snapshot. If it had to go beyond the primary selector, that's recorded as a **healing
event** -- it does **not** silently rewrite your test case.

**What you do about it:** open **sidebar > Self-Healing**. Each pending event shows the
old vs. new selector, a confidence level, a screenshot, and a note. You choose:

- **Approve & make primary** -- replace the step's selector going forward.
- **Approve as alternate** -- keep the old primary, but add this as a fallback candidate
  for next time.
- **Dismiss** -- ignore it; the step keeps using only what it already had.

Nothing is applied permanently without one of these three actions.

## 9. Dashboard

**sidebar > Dashboard** (also where clicking a project from the home page now takes you)
gives you, per project:

- Metric cards: total tests, pass/fail/skipped (last 20 runs), flaky-test count (a test
  that passed *and* failed in its last 5 runs), average run duration in seconds, a
  release-readiness score (% of approved tests currently passing, penalized for
  flakiness), and the open change-request count.
- **Test cases by type** -- a proportional bar per type, so you can see coverage balance
  at a glance.
- **Open change requests** -- anything flagged via step 6 that still needs the owner's
  attention, resolvable right from here.
- **All test cases** -- every test case in the project, with its owner, status, type,
  priority, and any open flags, paginated 10 at a time, with a one-click Run.
- **Recent runs** -- the last 20 runs; click any row (or "View steps") to drill into
  that run's per-step results, screenshots, and logs.

## 10. Team

**Header > Team** shows everyone with access. An admin can add teammates there (pick a
username, password, and role). A `member` can do everything except add other teammates
or edit/delete test cases they don't own; an `admin` can do both.

## 11. Cost tracking

The chat panel shows a running token/cost total for the project (also broken down by
call type: chat, failure explanation, selector recovery, step generation). Default model
is Sonnet with prompt caching enabled, which is materially cheaper than Opus for
high-volume generation/execution -- see README > Configuration if you want to switch
models per environment cost/quality tradeoffs.

## 12. Exporting for CI

Any test case's **Export as Playwright script** button downloads a standalone
`@playwright/test` `.spec.ts` file using the same resilient locators -- no LLM call
needed, drop it into an existing Playwright project and run it in CI as usual.
