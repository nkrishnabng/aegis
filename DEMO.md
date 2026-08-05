# AegisQA Demo Script

*A full-tour walkthrough (~25-30 min) for an internal audience — colleagues and
leadership who haven't seen the product live yet. Written to be read once beforehand
and glanced at during the demo, not read aloud. Target site: **[saucedemo.com](https://www.saucedemo.com/)**.*

Format: **SAY** is a suggested line (adapt to your own voice), **DO** is the click/action,
**SHOW** calls out what the audience should be looking at on screen.

---

## Why saucedemo.com

It's Sauce Labs' own QA practice site, and unlike a generic login form it ships **six
built-in test accounts, each with a different, real quirk on purpose** — which means
several acts below (self-healing, visual regression, "when it actually breaks") can use
a genuine behavior instead of you having to fake one.

| Username | Password | What's different about it |
|---|---|---|
| `standard_user` | `secret_sauce` | Clean, working account — your baseline for everything. |
| `locked_out_user` | `secret_sauce` | Login is rejected with a lockout message — a ready-made negative test. |
| `problem_user` | `secret_sauce` | Product images are broken/mismatched across the catalog — a real visual bug. |
| `visual_user` | `secret_sauce` | Subtle layout/CSS differences (spacing, alignment) — purpose-built for visual-diff testing. |
| `performance_glitch_user` | `secret_sauce` | Noticeably slower page loads — fine to skip unless you want a "the system still captures a screenshot even on a slow step" beat. |
| `error_user` | `secret_sauce` | Assorted broken interactions in the cart/checkout flow — worth a 2-minute sanity check the morning of your demo, since exactly what's broken has shifted across versions of the site. |

All six log into the same store: an inventory page (six "Sauce Labs ..." products, each
with an **Add to cart** button), a cart icon top-right, and a three-step checkout
(**Your Information** → **Overview** → **Finish**, ending on a "Thank you for your
order" confirmation).

---

## Before you go live

A demo lives or dies on setup. Ten minutes now saves an awkward silence later — this
tour touches more surface area than a quick walkthrough, so give yourself a bit longer
to stage it.

- [ ] Both servers running: `npm run dev:backend` and `npm run dev:frontend`.
- [ ] Signed in as an account with **owner** access (the seeded admin, or any project
      owner) — you'll need it to touch Members, Environments, and Integrations.
- [ ] Create a project (or confirm one already exists): name it **"Demo: Sauce Labs"**,
      target URL `https://www.saucedemo.com/`. (The seeded demo project still points at
      `the-internet.herokuapp.com` from `npm run seed` — that's fine to leave alone or
      delete, this tour uses a separate one.)
- [ ] Have **2-3 approved test cases already run at least once** in that project, so the
      Dashboard shows real numbers instead of empty states.
- [ ] **Pre-stage the self-healing moment.** Live selector drift is unpredictable — don't
      gamble the best beat of the demo on saucedemo's markup changing on cue. Beforehand:
      open a passing test case that clicks **Add to cart** on the Sauce Labs Backpack,
      edit that step's selector to something slightly wrong, save it, run it once
      privately so a `HealingEvent` lands in the review queue, and leave it
      **unapproved**.
- [ ] **Pre-capture a visual baseline.** Add an `assertVisualMatch` step on the inventory
      page to a test case, log in as `standard_user`, run it once so a `VisualBaseline`
      is captured. You'll re-run the same case as `visual_user` (or `problem_user`) live
      to produce a real, honest diff against it — not a staged one.
- [ ] **Have a second account ready to show role differences** — an `editor` and/or
      `viewer` on this project (add one now under Members if you don't have one), so you
      can show the same project rendering different available actions depending on who's
      looking at it.
- [ ] Pre-load extra tabs: **Flows, Environments, Integrations, Self-Healing, Visual
      Regression, Dashboard, Members** — switching should feel instant, not like you're
      hunting for a URL mid-sentence.

---

## The story in one breath

Test suites rot. Someone renames a CSS class, a selector breaks, a real bug hides behind
ten unrelated failures, and by the time anyone looks, the whole suite is muted in CI.
AegisQA closes that loop: an AI agent writes the tests by actually looking at your page,
the tests describe *intent* instead of brittle selectors, shared setup (like logging in)
is written once and reused everywhere, and when the page shifts slightly — or literally
looks different — the system proposes the fix instead of silently going red. Nothing
changes without a human clicking approve, and not just anyone can click it. That's the
whole pitch. Everything below is proving it.

---

## Cast of characters: roles at a glance

Before the feature tour, it's worth setting up *who* can do what — it comes up in every
other act. There are two separate, independent role systems.

**Site-wide** (`User.role`) — set on the Admin page:

| Role | Can do |
|---|---|
| **Admin** | Sees every project as owner regardless of membership. Manages every login (add teammates, edit an existing one's role or reset their password). The only role that can reach the Admin page at all. |
| **Member** | No special site-wide access — what they can actually do on any given project depends entirely on that project's Members page. |

**Per-project** (`ProjectMember.role`) — set on a project's Members page, one row per
person:

| Role | Can do |
|---|---|
| **Owner** | Manages members, credentials, and integrations. Can do everything below. |
| **Editor** | Creates, edits, runs, and deletes test cases, environments, and flows. |
| **Reviewer** | Read-only, *plus* can approve or reject a test case someone else authored. Can't edit test content, and can't approve their own tests. |
| **Viewer** | Read-only. Can still run tests, but can't create, edit, or approve anything. |

**SAY (the one line worth landing):**
> "A reviewer or owner can approve a test — but never the person who wrote it, even if
> they also happen to hold reviewer access. That's enforced on the backend, not just
> hidden in the UI — segregation of duties by design, not by honor system."

**Optional live beat, if you have a second account handy:** open an incognito window,
log in as your editor/viewer test account, and show the same project with Members/
credentials/approve actions simply not there — nothing to argue about, the access
genuinely isn't rendered because the API wouldn't allow it anyway.

---

## Act 1 — The ask: test generation (0:00–3:00)

**SAY:**
> "Let's say I need coverage for our storefront's login. Normally that's an afternoon of
> writing Playwright selectors by hand. Watch what happens instead."

**DO:** Open the project. In the Source Requirement / chat box, type:

> Generate test cases for logging in as the standard user

**SHOW:** Narrate what's happening while it runs — this is the moment to slow down.

**SAY:**
> "It's not guessing. It just opened a real browser, navigated to saucedemo.com, and read
> the accessibility tree — the same information a screen reader would use. It saw a
> username field, a password field, and a login button, and it's proposing a test case
> based on what's really there."

**DO:** Let the generated test case land in the list (status `draft`). Open it.

**SAY:**
> "Here's a full test case — objective, preconditions, expected result, priority, steps.
> And critically —" *(point at a step's selector)* "— it didn't hardcode a raw CSS path.
> Saucedemo actually tags its interactive elements with `data-test` attributes, and the
> agent picked those up — so this test doesn't care if a class name changes next sprint."

**DO:** Point out the **resilient** badge on a step.

**SAY:**
> "Green means resilient — role, label, text, or test-id. If it ever has to fall back to
> raw CSS, it flags that step brittle so you know exactly where your risk is, instead of
> finding out when it breaks in CI."

**DO:** Ask for one more, to show it's not a one-shot trick:

> Now generate a negative test — logging in as the locked-out user

**SAY:**
> "It reuses everything it already learned about this page and writes a negative case:
> wrong-in-a-different-way credentials, assert the lockout message instead of the
> inventory page."

---

## Act 2 — The proof: running it (3:00–5:30)

**SAY:**
> "Reading a test case is nice. Let's run one."

**DO:** Click **Run** on the standard-user login test. Let it stream live.

**SHOW:** The per-step results populating in real time, with a screenshot per step.

**SAY:**
> "Every step reports pass or fail as it happens, with a screenshot, plus console and
> network logs captured underneath — so when something does fail, you're not starting
> from zero."

---

## Act 3 — Flows: write shared setup once (5:30–9:00)

**SAY:**
> "Here's a problem every real suite has: almost everything I test on this site needs me
> logged in first. Adding an item to the cart, checking out, viewing the inventory — they
> all start with the same three steps. I don't want to duplicate that thirty times."

**DO:** Navigate to **Flows** → **+ New Flow**. Name it "Login as standard user," and add
the same steps from Act 1's login test case (navigate, fill username, fill password,
click login).

**SAY:**
> "That's it — a named, reusable sequence. Now watch what happens when I build the next
> test case."

**DO:** Go to Test Generation, ask for a new case:

> Generate a test case for adding the Sauce Labs Backpack to the cart and completing checkout

**DO:** In the generated test case's editor, use **Insert flow** and pick "Login as
standard user" instead of letting three separate steps sit there duplicated.

**SAY:**
> "One thing I really care about here: editing that flow later doesn't silently rewrite
> every test case that already used it. It creates a new, immutable version. A test case
> only ever picks up the update when someone explicitly applies it — so nothing changes
> out from under you between yesterday and today."

---

## Act 4 — Environments: config and credentials, not hardcoding (9:00–11:30)

**SAY:**
> "Every one of these test users has the same password, `secret_sauce`. I could type that
> into every test case's data. I'd rather not — and here's why."

**DO:** Navigate to **Environments** → **+ New Environment**. Name it "Production," base
URL `https://www.saucedemo.com/`, pick a browser, then add a credential — key
`SAUCE_PASSWORD`, value `secret_sauce`.

**SAY:**
> "That value is encrypted at rest. From here on, a step references it as
> `{{env.SAUCE_PASSWORD}}` instead of the literal string — the real value is only ever
> substituted server-side, right before the browser action runs. It never appears in the
> test case text, an exported script, or in what gets sent to the AI model."

**DO:** Point at an existing step's password field, showing the templated reference
rather than plaintext.

**SAY:**
> "So the same suite can point at a dev environment with dev credentials and a staging
> environment with staging credentials, without a single step changing — you just pick
> the environment when you hit Run."

---

## Act 5 — The wow moment: self-healing (11:30–15:00)

This is the beat that makes people lean forward. Everything before this is "AI writes
tests." This is "the system survives contact with a changing product" — the actual,
expensive problem teams have with test automation today.

**SAY:**
> "Here's the real question every QA lead asks me: 'Fine, but what happens six weeks from
> now when someone renames a class and every test goes red?' Let me show you."

**DO:** Navigate to **Self-Healing** (the event you staged earlier — the backpack's Add
to cart selector — is sitting there, pending).

**SAY:**
> "This selector stopped matching on a recent run. The system didn't just fail loudly —
> it went and looked at the live page, found the element it thinks you meant, and it's
> showing me exactly what changed: old selector, new selector, a confidence score, and a
> screenshot so I can eyeball it myself."

**DO:** Point at the diff (old vs. new selector) and the confidence badge.

**SAY:**
> "And this is the part I actually care about: it has *not* changed anything yet. Nothing
> auto-applies. It's sitting in a queue waiting for a person to say yes."

**DO:** Click **Approve as primary** (or **Approve as alternate** to show the softer
option — that keeps the old selector as first choice and adds this as a fallback, rather
than replacing it outright).

**SAY:**
> "That's it. One click, and the suite has healed itself — with a human still in the
> loop on every single change. No silent rewrites, no surprise diffs six months later when
> someone asks 'wait, when did this selector change?' — it's all logged, right here."

---

## Act 6 — Visual regression: a bug you can actually see (15:00–18:00)

**SAY:**
> "Some bugs aren't a broken selector — the page still works, it just *looks* wrong. That
> needs a different kind of test."

**DO:** Open the test case with the `assertVisualMatch` step on the inventory page (the
one you baselined earlier as `standard_user`). Run the same case again, but as
`visual_user` (or `problem_user` for a more dramatic, obviously-broken-images version).

**SHOW:** Navigate to **Visual Regression** once the run finishes.

**SAY:**
> "Here's a pending diff — the baseline screenshot, what actually rendered this time, and
> a pixel-highlighted image of exactly what changed. This is a real difference this test
> user's account has, not something I staged with an image editor."

**DO:** Walk through **Approve** (promotes this screenshot to be the new baseline) vs.
**Reject** (leaves the existing baseline untouched — this run's screenshot was a
one-off/expected variation, not a new normal).

**SAY:**
> "Same philosophy as self-healing: the system flags it, a human decides whether it's a
> regression or an intentional redesign. It never silently redefines what 'correct'
> looks like."

---

## Act 7 — When it actually breaks, and Integrations (18:00–21:30)

**SAY:**
> "Let's actually break something — with a test user that's known to have rough edges in
> its cart/checkout flow."

**DO:** Run (or generate then run) the add-to-cart-and-checkout test case as `error_user`.
Let a step fail.

**SHOW:** The failed run's results page.

**SAY:**
> "This isn't just a red X and a stack trace. There's a plain-language explanation of
> what went wrong and a suggested fix — and if it turns out to be a selector issue
> specifically, there's usually already a healing suggestion waiting by the time you
> look."

**DO:** Navigate to **Integrations** to show a configured tracker (Jira, GitHub Issues, or
Azure DevOps — whichever you have set up), then back to the failed run and click **Push
to \[tracker\]**.

**SAY:**
> "One click files an issue covering every failed step, with the error and suggested fix
> already in the description. Click it again and it won't create a duplicate — it just
> shows you the existing issue. And if a project hasn't configured a tracker yet, this
> fails with an honest error instead of pretending it worked."

---

## Act 8 — The payoff: does this actually help? (21:30–23:30)

**SAY:**
> "All of that is nice for one test. Here's why it matters for a whole suite."

**DO:** Navigate to **Dashboard**.

**SAY (pick 2-3 of these, don't read all of them):**
> "Test Health Score — one number, weighted by pass rate and flakiness, that tells a
> release manager 'is this suite trustworthy today.'"

> "Release Readiness — how close we are to every approved test passing, penalized for
> flaky ones, so it's not just 'green' when it's actually 'green but flaky.'"

> "Coverage by module, and failing tests grouped by priority — so if something's on fire,
> it's obvious whether it's a P1 or a nice-to-have."

> "And Time Saved — a clearly-labeled *estimate*, not a made-up number, of manual QA hours
> this suite is replacing."

**SAY (closing this act):**
> "None of this is fabricated. Every one of these numbers comes from real runs that
> actually happened — there's no synthetic 'demo mode' data behind this."

---

## Act 9 — The close (23:30–25:00)

**SAY:**
> "So: describe what you want tested in plain English, the agent inspects your real page
> and writes resilient tests instead of brittle ones, shared setup is written once and
> reused everywhere, when the page shifts — visually or structurally — the system
> proposes the fix instead of failing silently, and a human always has the last word on
> whether to accept it. That's the loop."

**SAY (a good moment to fold the roles story back in for an internal audience):**
> "And none of that is a free-for-all — who can author a test, who can approve it, who
> can touch credentials or push to a tracker, that's all role-gated and enforced
> server-side, not just hidden buttons in the UI."

**Close with a question, not a statement:**
> "What's the test suite in your world you'd want to point this at first?"

---

## Anticipated questions

- **"Does it ever change my tests without telling me?"** No — self-healing and visual
  regression both produce a pending suggestion (with evidence: a confidence score and a
  screenshot, or a pixel-highlighted diff image); nothing is applied without an explicit
  approve click.
- **"Can I get these tests out of the platform?"** Yes — any test case exports as a
  standalone `.spec.ts` using the same resilient locators, runnable with
  `npx playwright test` with zero dependency on this tool. There's also a one-click "Export
  CI package" that bundles every approved test as specs, a Playwright config, and a ready
  GitHub Actions workflow.
- **"What stops someone from approving their own work?"** Per-project roles
  (owner/editor/reviewer/viewer) — a reviewer or owner can approve or reject a test case,
  but never the person who authored it, even if they hold reviewer access themselves.
- **"Where do credentials/secrets live?"** Encrypted at rest (AES-256-GCM) inside a named
  Environment, referenced in a step as `{{env.KEY}}` and resolved server-side right before
  the browser action runs — the real value never appears in the test case, an exported
  script, or the chat/LLM context.
- **"What happens if I edit a Flow that ten test cases already use?"** Nothing, until
  someone explicitly applies the update on each one. Editing a Flow creates a new
  immutable version; existing test cases keep running exactly what they inserted.
- **"Who can see what on a project?"** Membership is per-project, not "everyone with a
  login sees everything" — you need an explicit row on that project's Members page (or be
  a site-wide admin) to see it at all.

---

## If something goes wrong live

- **Agent is slow to respond:** narrate the architecture while you wait — "it's driving a
  real headless browser via Playwright MCP right now, this isn't a canned response" —
  turns dead air into a feature explanation.
- **A run fails for a reason unrelated to the demo (site flake, network blip):** that's a
  real, honest failure — say so, and pivot to the pre-staged healing event / visual
  baseline or a previously-recorded run instead of fighting a live flaky site on stage.
- **`error_user`'s specific bug isn't reproducing the way you expected:** saucedemo's demo
  accounts have changed behavior across versions before — do a 2-minute sanity pass the
  morning of your demo, and have a backup plan (e.g. intentionally assert the wrong text)
  if the "natural" failure doesn't show up on cue.
- **Someone asks about a feature you're not covering:** it's real and shipped — just say
  "great question, let me show you" and go off-script rather than deflecting.
