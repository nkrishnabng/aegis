# Design System — AegisQA

## Product Context
- **What this is:** An AI-driven test-automation tool. Chat with an agent to inspect a
  real page, generate structured Playwright test cases, run them in a real browser, and
  review results (screenshots, traces, videos, visual diffs, self-healing).
- **Who it's for:** QA engineers and developers using it internally at a company, not
  end-consumers.
- **Space/industry:** Developer tooling / QA & test automation, adjacent to Linear,
  Vercel, Cursor, and observability dashboards (Sentry, Datadog).
- **Project type:** Web app / dashboard (Next.js App Router, dark-only).
- **Memorable thing:** *An AI agent is actually doing the work here.* Every design
  decision should make the agent's live activity (chat, tool calls, running test steps)
  feel like the product's main character, not a bolted-on chatbot.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian, precision-instrument mood.
- **Decoration level:** Intentional — a faint radial glow behind hero/live moments only;
  everywhere else stays flat and quiet. No illustration, no mascot, no gradients as a
  primary device.
- **Mood:** Serious, dense, legible — a real instrument for people handling real
  execution data (credentials, screenshots, failures) — but never sterile. The one thing
  allowed to feel *alive* is the agent's live activity itself (a pulsing "running"
  indicator, streaming chat/tool-call text), which is where all the product's warmth
  and personality live.
- **Reference sites (researched live, 2026-07):** linear.app (dark, agent-in-workflow
  positioning, chat-transcript hero sections), vercel.com (confident oversized type,
  "agentic infrastructure" positioning), cursor.com (floating live-status/task-list
  panels as the hero visual — the closest existing analog to what AegisQA's dashboard
  actually does for real). Explicitly avoided: sentry.io's mascot-illustration,
  purple-gradient marketing register — wrong tone for a tool handling real credentials.

## Typography
- **Display/Hero:** Bricolage Grotesque, weight 700 (variable font, usable 500–800) —
  distinctive geometric character at large sizes without being a novelty face. Used
  sparingly: hero headlines, big dashboard numbers, empty-state headlines. Replaces
  Inter for anything larger than ~20px.
- **Body:** Instrument Sans, 400 — clean, technical, excellent at small sizes where
  this app spends most of its life (tables, step lists, forms).
- **UI/Labels:** Instrument Sans, 600 — buttons, nav labels, badges.
- **Data/Tables:** JetBrains Mono, 400–500, with `font-variant-numeric: tabular-nums` —
  durations, diff percentages, run IDs, timestamps. Anywhere digits need to line up in
  a column.
- **Code:** JetBrains Mono, 400 — exported spec previews, `{{env.KEY}}`/`{{data.COL}}`
  placeholder syntax.
- **Loading:** Self-host as `@font-face` with inlined `woff2` (or a standard
  `next/font/google` config for Bricolage Grotesque / Instrument Sans / JetBrains
  Mono) — do not rely on a runtime Google Fonts `<link>`.
- **Scale:** display 56/40 (hero, responsive) · h1 28 · h2 20 · body 14–15 · label 13 ·
  mono data 12–14 · caption 11–12, all with `letter-spacing: -0.01em` at the display
  end and `0.04–0.08em` uppercase tracking on mono labels/eyebrows.

## Color
- **Approach:** Restrained — one accent, used only for "this is live/active," never
  decoratively.
- **Background:** `#0b0f1a` (near-black navy)
- **Surface:** `#141b2e` · **Surface (raised/inset):** `#0f1524`
- **Border:** `#232c42` · **Border (soft/divider):** `#1a2138`
- **Text:** `#f4f6fb` · **Text (dim):** `#929cb3` · **Text (faint/meta):** `#5c6884`
- **Primary accent — "live":** `#f4b942` (gold). Reserved exclusively for
  running/active/streaming states — a pulsing dot on the currently-executing step, a
  tool-call chip, an active-session eyebrow. Never used as a generic brand color or a
  button default. Hover/pressed: `#a9852f`. Wash background for chips: `#2a1f04`.
- **Quiet/info:** `#6c86ad` (replaces the old `--accent-2` purple entirely — purple as
  "the AI color" is a cliché this system deliberately avoids).
- **Semantic:** success `#34d399` · warning `#fb923c` · danger `#f87171` · these stay
  visually distinct from the primary accent so "warning" and "something is running"
  are never confused.
- **Dark mode:** N/A by design — AegisQA is dark-only; there is no light theme to
  redesign. This is a deliberate product decision, not an oversight (see Known
  limitations in README.md).

## Spacing
- **Base unit:** 8px.
- **Density:** Hybrid — compact in data-dense views (run/step lists, tables, the
  dashboard), comfortable in the two "hero" surfaces (the chat panel, an in-progress
  run's step list), which get more padding and breathing room than static config
  screens (Environments, Integrations, Admin).
- **Scale:** 2xs(4) xs(8) sm(12) md(16) lg(24) xl(32) 2xl(48) 3xl(64).

## Layout
- **Approach:** Grid-disciplined. Keep the existing sidebar + content app shell as-is —
  it's already correct for this category and doesn't need reinvention.
- **Grid:** Sidebar fixed width (`--sidebar-width`, currently 250px) + fluid content
  column; content max-width ~1180px on wide screens for readability of text-heavy
  panels (chat, diagnosis, suggested fixes).
- **Border radius:** sm 6px (chips, inputs) · md 10px (cards, buttons) · lg 16px
  (elevated panels — the chat/demo card, the mock dashboard frame).
- **Hierarchy rule:** live-agent surfaces (chat stream, an in-progress run) get more
  visual weight (larger padding, the accent glow, elevated shadow) than static
  admin/config screens, which stay flat and quiet by comparison.

## Motion
- **Approach:** Intentional, not decorative. Every motion choice exists to reinforce
  "something is actually happening right now," nothing is purely ornamental.
- **Signature moves:**
  - `pulse-dot` — a soft expanding-ring pulse (box-shadow keyframe) on the currently
    running step's status indicator and the "agent session active" eyebrow dot.
  - A steady `blink` (step, not eased) on tool-call chips while a tool call is in
    flight, mimicking a terminal cursor/recording light.
  - Streaming chat/tool-call text reveals as it arrives over the WebSocket — no
    artificial typewriter effect on top of real streaming, just don't fight it with
    layout shift.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`.
- **Duration:** micro 80ms · short 200ms · medium 320ms · long (pulse/blink loops)
  1.4–1.8s.
- Respect `prefers-reduced-motion: reduce` — collapse all durations/iterations.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-23 | Initial design system created via `/design-consultation` | Researched linear.app, vercel.com, cursor.com, sentry.io live. Replaced Inter + blue/purple accent duo with Bricolage Grotesque/Instrument Sans/JetBrains Mono + a single gold "live" accent, chosen specifically to reinforce the product's agent-forward positioning. Kept the existing dark-only navy background and sidebar+content shell — both already correct for the category. Approved by user after reviewing a rendered HTML preview (published as a Claude Artifact) showing the system applied to a live-chat-style hero and a dashboard mockup. |
| 2026-07-23 | Migrated the system into the real frontend (`layout.tsx`, `globals.css`, and per-page components) | Fonts loaded via `next/font/google`; all `:root` tokens replaced; `pulse-dot` applied to `.badge.running`; gold removed from generic buttons/chat bubbles/hover states (reserved for the running-badge and the chat "agent is live" indicator only) with `.btn.primary` moved to a plain light-fill and several white-on-gold contrast issues fixed via `--accent-ink`. Also swept `reports/page.tsx` and `help/page.tsx` for hardcoded hex left over from the old blue/purple accent pair (many were literal snapshots of the deprecated token values, silently mismatched once the tokens changed underneath them) and re-derived them from the current tokens via `color-mix()`. Independent categorical color systems that were never tied to the accent tokens — `TYPE_COLORS` in the dashboard, and the cyan/amber help-section category badges — were deliberately left alone. |
