"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminConfig, UserSummary } from "@testingmcp/shared";
import { api } from "../../lib/api";
import { EmptyState } from "../../components/EmptyState";
import {
  BarChartIcon,
  BotIcon,
  BugIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  HealIcon,
  PlugIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
  XIcon,
} from "../../components/icons";

interface HelpSection {
  id: string;
  category: string;
  title: string;
  keywords: string;
}

const CATEGORY_ORDER = ["Get started", "Core workflow", "Configuration", "Insights & admin", "More"];

const SECTIONS: HelpSection[] = [
  {
    id: "gettingStarted",
    category: "Get started",
    title: "Getting started",
    keywords: "sign in log in create project add target url onboarding setup account first",
  },
  {
    id: "testGeneration",
    category: "Core workflow",
    title: "Test generation",
    keywords:
      "chat generate ai agent source requirement user story acceptance criteria attach txt md file resilient selectors role label text placeholder inspect live page follow up clarifying",
  },
  {
    id: "reviewing",
    category: "Core workflow",
    title: "Reviewing & editing test cases",
    keywords:
      "edit fields objective preconditions test data expected result priority type module tag drag reorder steps selector quality badge resilient brittle quick add export playwright script standalone",
  },
  {
    id: "running",
    category: "Core workflow",
    title: "Running tests",
    keywords:
      "run one all approved concurrency cap parallel live per step results screenshots console network logs plain language failure explanation suggested fix",
  },
  {
    id: "cicd",
    category: "Core workflow",
    title: "CI/CD export & reports",
    keywords:
      "ci cd export package zip github actions workflow playwright config spec files cli runner junit xml html report batch run all pipeline",
  },
  {
    id: "environments",
    category: "Configuration",
    title: "Environments",
    keywords:
      "environment named per project config base url browser chromium firefox webkit headless viewport encrypted credentials secrets env key",
  },
  {
    id: "integrations",
    category: "Configuration",
    title: "Integrations (Jira)",
    keywords:
      "integrations jira push issue tracker api token project key cloud atlassian github issues azure devops mock adapter",
  },
  {
    id: "selfHealing",
    category: "Configuration",
    title: "Self-healing selectors",
    keywords:
      "self healing selector no longer matches alternates ai closest match pending suggestion old new confidence screenshot approve primary alternate dismiss nothing changes silently maintenance",
  },
  {
    id: "ownership",
    category: "Configuration",
    title: "Roles, ownership & change requests",
    keywords:
      "ownership owner editor reviewer viewer admin edit delete view run flag request changes permissions creator role project members approve reject approval segregation of duties",
  },
  {
    id: "dashboard",
    category: "Insights & admin",
    title: "Dashboard",
    keywords:
      "dashboard test health score release readiness automation coverage time saved run summary failing tests priority module recent agent activity feed",
  },
  {
    id: "reports",
    category: "Insights & admin",
    title: "Reports & analytics",
    keywords: "reports analytics trend charts pass fail skip volume average duration 30 days",
  },
  {
    id: "admin",
    category: "Insights & admin",
    title: "Admin",
    keywords:
      "admin team role management member system config active model credential encryption status defaults read only workspace edit teammate reset password change role site-wide global",
  },
  { id: "faq", category: "More", title: "FAQ", keywords: "faq frequently asked questions troubleshooting help" },
];

const FAQS = [
  {
    q: "Does the platform change my selectors automatically?",
    a: "No. Self-healing only proposes. Every candidate is logged as a pending suggestion with the old and new selector, a confidence score, and a screenshot, and stays inactive until an owner or admin approves it. Nothing changes silently.",
  },
  {
    q: "Who can edit a test case?",
    a: 'The person who created it owns it, and only that creator or a site admin can edit or delete it. Everyone else can view it, run it, and use "Request changes" to flag an edit for the owner to review. This is on top of project-level access — you need at least "editor" on the project before authorship is even checked.',
  },
  {
    q: "Who can approve a test case?",
    a: 'A project "reviewer" or "owner" — never the test case\'s own author, even if they also hold reviewer/owner access. Approve and Reject buttons appear on the test case page for eligible reviewers; approving sets status to "approved", rejecting sends it back to "draft". This segregation of duties is enforced on the backend, not just hidden in the UI.',
  },
  {
    q: "How does the AI keep selectors from breaking?",
    a: "When it inspects your live page it prefers resilient locators — role, label, visible text, placeholder and alt text — over brittle CSS or XPath, and flags any brittle step with a badge so you can harden it before relying on it in CI.",
  },
  {
    q: "Where do credentials live, and are they safe?",
    a: "Inside an environment. Credentials are encrypted at rest (AES-256-GCM) and referenced in steps as {{env.KEY}}, so the secret value never appears in a test case, an exported script, or the chat/LLM context.",
  },
  {
    q: "Can I run the whole suite in parallel?",
    a: '"Run all" executes every approved test, up to your project’s concurrency cap. Each run streams per-step results, screenshots, and console/network logs as it goes.',
  },
  {
    q: "Can I use these tests outside the platform?",
    a: "Yes. Any test case can be exported as a standalone Playwright script (.spec.ts) using the same resilient locators — drop it into an existing Playwright project and run it in CI as usual.",
  },
  {
    q: "How do I change my role or add teammates?",
    a: 'There are two separate role systems. Your site-wide role (admin or member) is set on the Admin page by a site admin, who can also edit an existing teammate\'s role or reset their password there. Your access on any individual project (owner, editor, reviewer, or viewer) is set separately on that project\'s Members page by a project owner. Reach whichever admin/owner applies for the access you need.',
  },
  {
    q: "Can I run the suite in my own CI pipeline?",
    a: 'Yes. "Export CI package" on the Test Generation page downloads a zip with every test case as a standalone .spec.ts, a Playwright config, and a GitHub Actions workflow — commit it to a repo and it runs as-is.',
  },
  {
    q: "Can failed tests automatically become Jira tickets?",
    a: 'Configure Jira on a project\'s Integrations page (admin only), then click "Push to Jira" on a failed run to file one issue covering every failed step. It won\'t create a duplicate on repeat clicks, and it fails honestly if Jira isn\'t configured.',
  },
];

const CHIPS = ["Test generation", "Self-healing", "Environments", "Running tests", "CI/CD export", "Jira"];

function normalize(s: string): string {
  return s.toLowerCase();
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeSec, setActiveSec] = useState("gettingStarted");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [me, setMe] = useState<UserSummary | null>(null);
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    api
      .me()
      .then((u) => {
        setMe(u);
        if (u.role === "admin") api.getAdminConfig().then(setAdminConfig).catch(() => setAdminConfig(null));
      })
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const container = document.querySelector(".app-main");
    if (!container) return;
    let raf: number | null = null;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        if (query.trim()) return;
        const containerTop = container!.getBoundingClientRect().top;
        let current = SECTIONS[0].id;
        for (const s of SECTIONS) {
          const el = sectionRefs.current[s.id];
          if (!el) continue;
          if (el.getBoundingClientRect().top - containerTop <= 100) current = s.id;
        }
        setActiveSec((prev) => (prev !== current ? current : prev));
      });
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [query]);

  function goToSection(id: string) {
    setActiveSec(id);
    const container = document.querySelector(".app-main");
    const target = sectionRefs.current[id];
    if (container && target) {
      const top =
        container.scrollTop + (target.getBoundingClientRect().top - container.getBoundingClientRect().top) - 18;
      container.scrollTo({ top, behavior: "smooth" });
    }
  }

  const { matched, searching, noResults } = useMemo(() => {
    const q = normalize(query.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const isSearching = words.length > 0;
    const m: Record<string, boolean> = {};
    let count = 0;
    for (const s of SECTIONS) {
      const haystack = normalize(`${s.title} ${s.keywords}`);
      const hit = !isSearching || words.every((w) => haystack.includes(w));
      m[s.id] = hit;
      if (isSearching && hit) count++;
    }
    return { matched: m, searching: isSearching, noResults: isSearching && count === 0 };
  }, [query]);

  const tocGroups = CATEGORY_ORDER.map((cat) => ({
    label: cat,
    items: SECTIONS.filter((s) => s.category === cat && (!searching || matched[s.id])),
  })).filter((g) => g.items.length > 0);

  function show(id: string): boolean {
    return searching ? matched[id] : true;
  }

  const resultCount = SECTIONS.filter((s) => matched[s.id]).length;

  return (
    <div className="page-container" style={{ maxWidth: 1180 }}>
      <div className="help-hero">
        <div style={{ position: "relative" }}>
          <span className="help-eyebrow">
            <BotIcon size={13} color="var(--accent-2)" strokeWidth={1.9} />
            DOCUMENTATION
          </span>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, letterSpacing: "-0.8px", margin: "14px 0 6px" }}>
            How can we help?
          </h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560, fontSize: "0.85rem", lineHeight: 1.55 }}>
            Everything about generating, reviewing, running, and maintaining AI-authored tests — from your
            first project to release-readiness reporting.
          </p>

          <div className="help-search">
            <SearchIcon size={18} color="var(--accent-2)" strokeWidth={1.9} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics — e.g. self-healing, environments, priority..."
            />
            {searching && (
              <button
                onClick={() => setQuery("")}
                className="btn"
                style={{ width: 26, height: 26, padding: 0, borderRadius: 7 }}
              >
                <XIcon size={14} strokeWidth={2} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: "0.7rem" }}>
              Popular:
            </span>
            {CHIPS.map((chip) => (
              <button key={chip} className="help-chip" onClick={() => setQuery(chip)}>
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="help-layout">
        <aside className="help-toc">
          <div className="help-toc-group-label">{searching ? `${resultCount} result(s)` : "On this page"}</div>
          {tocGroups.map((group) => (
            <div key={group.label}>
              <div className="help-toc-group-label">{group.label}</div>
              {group.items.map((s) => {
                const active = !searching && activeSec === s.id;
                const hilite = searching && matched[s.id];
                return (
                  <button
                    key={s.id}
                    className={`help-toc-item ${active ? "active" : ""} ${hilite ? "hilite" : ""}`}
                    onClick={() => goToSection(s.id)}
                  >
                    <span className="dot" />
                    <span>{s.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <div>
          {noResults && (
            <EmptyState
              icon="🔍"
              title={`No topics match "${query}"`}
              description='Try a shorter or different term — like "selectors", "environments", or "coverage". Still stuck? Reach your workspace admin.'
              action={
                <button className="btn primary" onClick={() => setQuery("")}>
                  Clear search
                </button>
              }
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
            {show("gettingStarted") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.gettingStarted = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--accent-2) 55%, white)", background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                  GET STARTED
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Getting started
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  From zero to your first AI-generated run in about five minutes. Follow the quick start, then
                  dig into any section below.
                </p>

                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 20 }}>
                    Quick start
                  </div>
                  <div className="help-quickstart">
                    {[
                      { label: "Sign in", desc: "Log into your workspace" },
                      { label: "Create a project", desc: "Add a name and a target URL" },
                      { label: "Describe what to test", desc: "In plain English — the agent does the rest" },
                      { label: "Review & run", desc: "Approve cases, then run one or all" },
                      { label: "Check the dashboard", desc: "Health, coverage & readiness" },
                    ].map((step, i, arr) => (
                      <div className="help-quickstart-step" key={step.label}>
                        <div className="help-quickstart-connector">
                          <div className={`line ${i === 0 ? "transparent" : ""}`} />
                          <div className="help-quickstart-circle">{i + 1}</div>
                          <div className={`line ${i === arr.length - 1 ? "transparent" : ""}`} />
                        </div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600, marginTop: 12 }}>{step.label}</div>
                        <div className="muted" style={{ fontSize: "0.7rem", marginTop: 3, lineHeight: 1.45 }}>
                          {step.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid-2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  <div className="help-card">
                    <div className="help-icon-tile" style={{ background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                      <UsersIcon size={16} color="var(--accent-2)" strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginTop: 12 }}>Sign in</div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 5, lineHeight: 1.55 }}>
                      Your role (admin or member) is assigned by an admin and determines what you can do.
                    </div>
                  </div>
                  <div className="help-card">
                    <div className="help-icon-tile" style={{ background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                      <FolderIcon size={16} color="var(--accent-2)" strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginTop: 12 }}>Create a project</div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 5, lineHeight: 1.55 }}>
                      A project groups test cases, environments, and runs for one product or module.
                    </div>
                  </div>
                  <div className="help-card">
                    <div className="help-icon-tile" style={{ background: "rgba(6,182,212,.14)" }}>
                      <SettingsIcon size={16} color="var(--info)" strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginTop: 12 }}>Add a target URL</div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 5, lineHeight: 1.55 }}>
                      The live page the agent opens and inspects when generating and running tests.
                    </div>
                  </div>
                </div>
              </section>
            )}

            {show("testGeneration") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.testGeneration = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--accent-2) 55%, white)", background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                  CORE WORKFLOW
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Test generation
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Describe a feature in plain English and the agent inspects your live page to propose
                  structured, ready-to-run test cases.
                </p>
                <div className="grid-2">
                  <div className="help-card">
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 14 }}>How it works</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {[
                        "In the Source Requirement box, describe the feature or paste a user story / acceptance criteria. Or attach a .txt / .md file.",
                        "Click Generate Scenarios. The agent opens your target URL and inspects the real DOM.",
                        "It proposes test cases with resilient selectors, mapped to what it actually found on the page.",
                        "The chat stays open below — ask follow-ups, request edits, or answer the agent's clarifying questions.",
                      ].map((text, i) => (
                        <div style={{ display: "flex", gap: 12 }} key={i}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 7,
                              background: "color-mix(in srgb, var(--accent-2) 14%, transparent)",
                              color: "color-mix(in srgb, var(--accent-2) 55%, white)",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#cbd5e1", lineHeight: 1.5 }}>{text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div className="help-callout info">
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "color-mix(in srgb, var(--accent-2) 55%, white)", display: "flex", alignItems: "center", gap: 8 }}>
                        <HealIcon size={15} color="var(--accent-2)" strokeWidth={1.8} />
                        Resilient selectors, by default
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#cbd5e1", marginTop: 9, lineHeight: 1.55 }}>
                        The agent prefers stable locators — role, label, visible text, and placeholder — over
                        brittle CSS or XPath that break on the smallest markup change.
                      </div>
                      <div className="help-code">
                        <div style={{ color: "var(--success)" }}>✓ getByRole(&apos;button&apos;, {"{"} name: &apos;Pay now&apos; {"}"})</div>
                        <div style={{ color: "var(--success)" }}>✓ getByLabel(&apos;Promo code&apos;)</div>
                        <div style={{ color: "var(--danger)" }}>✕ div.checkout &gt; form &gt; button:nth-child(4)</div>
                      </div>
                    </div>
                    <div className="help-card" style={{ display: "flex", alignItems: "center", gap: 13 }}>
                      <div className="help-icon-tile" style={{ background: "rgba(6,182,212,.14)", flexShrink: 0 }}>
                        <BarChartIcon size={17} color="var(--info)" strokeWidth={1.8} />
                      </div>
                      <div className="muted" style={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
                        Attach a spec, acceptance criteria, or user story and the agent extracts testable
                        criteria automatically — no reformatting needed.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {show("reviewing") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.reviewing = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--accent-2) 55%, white)", background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                  CORE WORKFLOW
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Reviewing &amp; editing test cases
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Every proposed case is fully editable before you automate it. Refine the details, reorder the
                  steps, and check selector quality per step.
                </p>
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>
                    Editable fields
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["Objective", "Preconditions", "Test data", "Expected result", "Priority", "Type", "Module tag"].map(
                      (f) => (
                        <span key={f} className="badge">
                          {f}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>
                    Assertion step types
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {[
                      "Enabled / disabled",
                      "Table contains",
                      "API response",
                      "Form validity",
                      "Accessibility (name/role)",
                    ].map((f) => (
                      <span key={f} className="badge">
                        {f}
                      </span>
                    ))}
                  </div>
                  <div className="muted" style={{ fontSize: "0.72rem", marginTop: 10, lineHeight: 1.55 }}>
                    Beyond text/visibility checks, a step can assert an element's enabled state, that a table
                    contains an expected row, that an in-page API call returned an expected status/body, that a
                    form passes native validation, or that an element exposes the accessible name/role you
                    expect.
                  </div>
                </div>
                <div className="grid-2" style={{ marginBottom: 14 }}>
                  <div className="help-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.78rem", fontWeight: 600 }}>
                      Drag to reorder steps
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      Grab a step by its handle and drop it into place — the case renumbers itself.
                    </div>
                  </div>
                  <div className="help-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.78rem", fontWeight: 600 }}>
                      Quick-add a step
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      Type an instruction like &quot;click the Apply button&quot; and the agent turns it into a
                      proper step with a selector.
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Per-step selector-quality badge</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span className="badge resilient">Resilient</span>
                      <span className="badge brittle">Brittle</span>
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: "0.72rem", marginTop: 10, lineHeight: 1.55 }}>
                    Each step shows how stable its locator is. A brittle badge is a nudge to swap in a role- or
                    label-based selector before you rely on it in CI.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 13, borderTop: "1px solid var(--border)" }}>
                    <div className="help-icon-tile" style={{ background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                      <BotIcon size={17} color="var(--accent-2)" strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Export as a Playwright script</div>
                      <div className="muted" style={{ fontSize: "0.7rem", marginTop: 2 }}>
                        Turn any test case into a standalone .spec.ts file you can run anywhere.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {show("running") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.running = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--accent-2) 55%, white)", background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                  CORE WORKFLOW
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Running tests
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Run a single case or every approved test at once, with a concurrency cap you control. Watch
                  results stream in step by step.
                </p>
                <div className="grid-2">
                  <div className="help-card" style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                    <div className="help-icon-tile" style={{ background: "color-mix(in srgb, var(--success) 14%, transparent)" }}>
                      <CheckIcon size={17} color="var(--success)" strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Run one, or Run all</div>
                      <div className="muted" style={{ fontSize: "0.72rem", marginTop: 5, lineHeight: 1.55 }}>
                        &quot;Run all&quot; executes every approved test up to the project&apos;s concurrency
                        cap — a big suite finishes fast without overwhelming your target.
                      </div>
                    </div>
                  </div>
                  <div className="help-card" style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                    <div className="help-icon-tile" style={{ background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                      <BarChartIcon size={17} color="var(--accent-2)" strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Live per-step results</div>
                      <div className="muted" style={{ fontSize: "0.72rem", marginTop: 5, lineHeight: 1.55 }}>
                        Each step reports pass/fail as it happens, with screenshots plus console and network
                        logs captured for every action.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="help-callout ai" style={{ marginTop: 14 }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "color-mix(in srgb, var(--accent-2) 55%, white)", display: "flex", alignItems: "center", gap: 8 }}>
                    <BugIcon size={15} color="var(--accent-2)" strokeWidth={1.8} />
                    When something fails
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#cbd5e1", marginTop: 9, lineHeight: 1.6 }}>
                    You get a plain-language explanation of what went wrong — not just a stack trace —
                    alongside a suggested fix. If it&apos;s a selector that drifted, self-healing may already
                    have a proposal waiting for your approval.
                  </div>
                </div>
              </section>
            )}

            {show("cicd") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.cicd = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--accent-2) 55%, white)", background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                  CORE WORKFLOW
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  CI/CD export &amp; reports
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Take the suite outside the platform and run it in your own pipeline, or hand a run's results
                  to whatever already consumes test reports in CI.
                </p>
                <div className="grid-2">
                  <div className="help-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.78rem", fontWeight: 600 }}>
                      Export CI package
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      From Test Generation, <strong style={{ color: "var(--text)" }}>Export CI package</strong>{" "}
                      downloads a zip with every test case as a standalone .spec.ts, a Playwright config, and a
                      ready-to-use GitHub Actions workflow — drop it into a repo and it runs as-is.
                    </div>
                  </div>
                  <div className="help-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.78rem", fontWeight: 600 }}>
                      JUnit &amp; HTML reports per batch
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      Every <strong style={{ color: "var(--text)" }}>Run all</strong> is a batch. Once it's
                      underway, download that batch's results as JUnit XML (for CI test-reporting plugins) or a
                      standalone HTML report — links appear on the Test Generation page after you start the run.
                    </div>
                  </div>
                </div>
              </section>
            )}

            {show("environments") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.environments = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "#67e8f9", background: "rgba(6,182,212,.13)" }}>
                  CONFIGURATION
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Environments
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Named, per-project execution configs so the same test suite can run against staging, prod, or
                  a preview branch without editing a single step.
                </p>
                <div className="grid-2">
                  <div className="help-card">
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>
                      What an environment holds
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                      {[
                        "Base URL for the target app",
                        "Browser — Chromium, Firefox, or WebKit",
                        "Headless mode & viewport size",
                        "Encrypted credentials & secrets",
                      ].map((item) => (
                        <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.75rem", color: "#cbd5e1" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--info)", flexShrink: 0 }} />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="help-card">
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>
                      Referencing secrets
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem", lineHeight: 1.55 }}>
                      Reference an encrypted value from any step with{" "}
                      <code style={{ color: "var(--accent)" }}>{"{{env.KEY}}"}</code>. The secret is resolved
                      server-side right before the action runs, never stored in the test case or passed to
                      chat/LLM context.
                    </div>
                    <div className="help-code">
                      <div>
                        <span style={{ color: "var(--accent-2)" }}>await</span> <span style={{ color: "var(--accent)" }}>login</span>(
                        <span style={{ color: "var(--success)" }}>&apos;admin@acme.io&apos;</span>,
                      </div>
                      <div style={{ paddingLeft: 22, color: "var(--warning)" }}>{"{{env.ADMIN_PASSWORD}}"}</div>
                      <div>);</div>
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 11,
                        fontSize: "0.65rem",
                        color: "color-mix(in srgb, var(--success) 60%, white)",
                        background: "color-mix(in srgb, var(--success) 14%, transparent)",
                        padding: "4px 9px",
                        borderRadius: 7,
                        fontWeight: 600,
                      }}
                    >
                      <CheckIcon size={12} strokeWidth={2.2} />
                      Encrypted at rest
                    </div>
                  </div>
                </div>
              </section>
            )}

            {show("integrations") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.integrations = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "#67e8f9", background: "rgba(6,182,212,.13)" }}>
                  CONFIGURATION
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Integrations (Jira)
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Connect a project to Jira Cloud so a failed run's diagnosis becomes an issue with one click —
                  no copy-pasting stack traces into a ticket.
                </p>
                <div className="grid-2">
                  <div className="help-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.78rem", fontWeight: 600 }}>
                      <PlugIcon size={15} color="var(--info)" strokeWidth={1.8} />
                      Setting it up
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      On the project's <strong style={{ color: "var(--text)" }}>Integrations</strong> page, an
                      admin enters the Jira Cloud base URL, account email, project key, and an API token
                      (generated at id.atlassian.com). The token is encrypted at rest and never shown back in
                      the UI — everyone else sees read-only status.
                    </div>
                  </div>
                  <div className="help-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.78rem", fontWeight: 600 }}>
                      Pushing a failed run
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      On a failed run's results page, click{" "}
                      <strong style={{ color: "var(--text)" }}>Push to Jira</strong> to file one issue covering
                      every failed step, with its error and suggested fix. The button becomes a{" "}
                      <strong style={{ color: "var(--text)" }}>View in Jira</strong> link once filed, and won't
                      create a duplicate if you click it again.
                    </div>
                  </div>
                </div>
                <div className="help-callout success" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 9, padding: "13px 16px" }}>
                  <CheckIcon size={15} color="var(--success)" strokeWidth={1.9} />
                  <span style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    <strong style={{ color: "var(--text)" }}>No configuration, no push.</strong> If Jira isn't
                    set up for a project, pushing fails with a clear message instead of pretending an issue was
                    created.
                  </span>
                </div>
              </section>
            )}

            {show("selfHealing") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.selfHealing = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "#67e8f9", background: "rgba(6,182,212,.13)" }}>
                  CONFIGURATION
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Self-healing selectors
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  When a stored selector stops matching, the platform tries to recover the test — but it never
                  rewrites your suite behind your back. Every heal is a suggestion you approve.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 14 }}>
                  <div className="help-card">
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 14 }}>
                      What happens on a miss
                    </div>
                    <div className="help-timeline">
                      {[
                        { color: "var(--warning)", title: "Selector no longer matches", sub: "The element moved or the markup changed" },
                        { color: "color-mix(in srgb, var(--accent-2) 60%, white)", title: "Executor tries known alternates", sub: "Any fallback locators saved on the step" },
                        { color: "var(--accent-2)", title: "AI finds the closest match", sub: "Inspects the live page for the intended element" },
                        { color: "var(--success)", title: "Logged as a pending suggestion", sub: "Awaits a human decision — nothing auto-applies" },
                      ].map((step) => (
                        <div className="help-timeline-item" key={step.title}>
                          <div className="help-timeline-dot" style={{ background: step.color }} />
                          <div style={{ fontSize: "0.75rem", fontWeight: 550 }}>{step.title}</div>
                          <div className="muted" style={{ fontSize: "0.65rem", marginTop: 2 }}>
                            {step.sub}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="help-callout ai">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "color-mix(in srgb, var(--accent-2) 55%, white)", display: "flex", alignItems: "center", gap: 7 }}>
                        <HealIcon size={14} color="var(--accent-2)" strokeWidth={1.8} />
                        Pending suggestion
                      </div>
                      <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "color-mix(in srgb, var(--success) 60%, white)", background: "color-mix(in srgb, var(--success) 14%, transparent)", padding: "3px 9px", borderRadius: 7 }}>
                        High confidence
                      </span>
                    </div>
                    <div className="help-code" style={{ marginTop: 12 }}>
                      <div style={{ color: "var(--danger)" }}>- getByTestId(&apos;saved-card-4242&apos;)</div>
                      <div style={{ color: "var(--success)" }}>+ getByRole(&apos;radio&apos;, {"{"} name: /4242/ {"}"})</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 13 }}>
                      <button className="btn primary" disabled style={{ opacity: 1 }}>
                        Approve as primary
                      </button>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn" disabled style={{ flex: 1, opacity: 1 }}>
                          Approve as alternate
                        </button>
                        <button className="btn" disabled style={{ flex: 1, opacity: 1 }}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="help-callout success" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 9, padding: "13px 16px" }}>
                  <CheckIcon size={15} color="var(--success)" strokeWidth={1.9} />
                  <span style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    <strong style={{ color: "var(--text)" }}>Nothing changes silently.</strong> A healed selector
                    only becomes active once an owner or admin approves it, on the Self-Healing page.
                  </span>
                </div>
              </section>
            )}

            {show("ownership") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.ownership = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "#67e8f9", background: "rgba(6,182,212,.13)" }}>
                  CONFIGURATION
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Roles, ownership &amp; change requests
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Access is layered: a project role decides what you can do on a project at all, and
                  test-case authorship decides who can edit or delete a specific case within that.
                </p>

                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>
                    Project roles (set on a project&apos;s Members page)
                  </div>
                  <div className="grid-2" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {[
                      { role: "Owner", desc: "Manages members, credentials, and integrations. Can do everything below." },
                      { role: "Editor", desc: "Creates, edits, runs, and deletes test cases, environments, and flows." },
                      { role: "Reviewer", desc: "Read-only, plus can approve or reject a test case someone else authored." },
                      { role: "Viewer", desc: "Read-only. Can still run tests, but can't create, edit, or approve." },
                    ].map((r) => (
                      <div key={r.role} className="help-card" style={{ padding: "12px 14px" }}>
                        <span className="badge">{r.role}</span>
                        <div className="muted" style={{ fontSize: "0.7rem", marginTop: 8, lineHeight: 1.5 }}>
                          {r.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="muted" style={{ fontSize: "0.7rem", marginTop: 12, lineHeight: 1.55 }}>
                    A site-wide admin bypasses project membership entirely and is treated as owner on every
                    project — this is a separate, higher-level role from the four above (see the{" "}
                    <a href="#admin" onClick={(e) => { e.preventDefault(); goToSection("admin"); }} style={{ color: "var(--accent-2)" }}>
                      Admin
                    </a>{" "}
                    section).
                  </div>
                </div>

                <div className="help-callout success" style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 16px" }}>
                  <CheckIcon size={15} color="var(--success)" strokeWidth={1.9} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.78rem", color: "#cbd5e1", lineHeight: 1.6 }}>
                    <strong style={{ color: "var(--text)" }}>Approving is separate from editing.</strong> Only a
                    reviewer or owner can approve or reject a test case, and never their own — an editor
                    (including the case&apos;s own author) can save draft/archived changes but can&apos;t flip a
                    case into &quot;approved&quot; directly. Approve/Reject buttons appear on the test case page
                    for whoever is eligible; rejecting sends an approved case back to draft.
                  </span>
                </div>

                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#cbd5e1", marginBottom: 12 }}>
                  Test-case authorship (on top of your project role)
                </div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Who</th>
                        <th style={{ textAlign: "center" }}>View &amp; run</th>
                        <th style={{ textAlign: "center" }}>Edit / delete</th>
                        <th style={{ textAlign: "center" }}>Request changes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { who: "Creator (test case author)", color: "color-mix(in srgb, var(--accent-2) 60%, white)", view: true, edit: true, request: false },
                        { who: "Site admin", color: "var(--accent-2)", view: true, edit: true, request: false },
                        { who: "Everyone else with project access", color: "var(--text-dim)", view: true, edit: false, request: true },
                      ].map((row) => (
                        <tr key={row.who}>
                          <td>
                            <span className="help-permission-dot" style={{ background: row.color }} />
                            {row.who}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {row.view ? (
                              <CheckIcon size={16} color="var(--success)" strokeWidth={2.2} />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {row.edit ? (
                              <CheckIcon size={16} color="var(--success)" strokeWidth={2.2} />
                            ) : (
                              <XIcon size={15} color="var(--danger)" strokeWidth={2.2} />
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {row.request ? (
                              <CheckIcon size={16} color="var(--success)" strokeWidth={2.2} />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 11 }}>
                  <div className="help-icon-tile" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)" }}>
                    <BugIcon size={16} color="var(--warning)" strokeWidth={1.8} />
                  </div>
                  <div className="muted" style={{ fontSize: "0.75rem", lineHeight: 1.55 }}>
                    Not the owner? Use <strong style={{ color: "var(--text)" }}>Request changes</strong> (on the
                    test case page) to flag an issue or suggest an edit — the owner sees it as a pending item on
                    the test case and the dashboard, so tests are never silently overwritten.
                  </div>
                </div>
              </section>
            )}

            {show("dashboard") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.dashboard = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--warning) 60%, white)", background: "color-mix(in srgb, var(--warning) 14%, transparent)" }}>
                  INSIGHTS &amp; ADMIN
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Dashboard
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Your at-a-glance view of suite quality and release confidence, refreshed as runs complete.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {[
                    { title: "Test Health Score", desc: "A single 0-100 read on suite stability, weighted by pass rate and flakiness." },
                    { title: "Release Readiness %", desc: "How close approved tests are to all passing, penalized for flaky tests." },
                    { title: "Automation Coverage %", desc: "Share of your test cases that are approved and in active rotation." },
                    { title: "Time Saved (estimated)", desc: "Estimated manual-QA hours avoided by automation, clearly labeled as an estimate." },
                    { title: "Run summary & failing by priority", desc: "Pass/fail/flaky/skip in one bar, plus open failures grouped by priority." },
                    { title: "Coverage by module & agent feed", desc: "Per-module pass-rate bars and a live feed of recent AI agent activity." },
                  ].map((card) => (
                    <div className="help-card" key={card.title}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>{card.title}</div>
                      <div className="muted" style={{ fontSize: "0.72rem", marginTop: 5, lineHeight: 1.5 }}>
                        {card.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {show("reports") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.reports = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--warning) 60%, white)", background: "color-mix(in srgb, var(--warning) 14%, transparent)" }}>
                  INSIGHTS &amp; ADMIN
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Reports &amp; analytics
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Trend charts over the last 30 days, computed from real run history, so you can see whether
                  quality is improving over time, not just today&apos;s snapshot.
                </p>
                <div className="grid-2">
                  <div className="help-card">
                    <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Run volume</div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      A stacked area chart of daily passed / failed / skipped run counts.
                    </div>
                  </div>
                  <div className="help-card">
                    <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>Average duration trend</div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8, lineHeight: 1.55 }}>
                      A line chart tracking whether runs are getting faster or slower over the period.
                    </div>
                  </div>
                </div>
              </section>
            )}

            {show("admin") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.admin = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "color-mix(in srgb, var(--warning) 60%, white)", background: "color-mix(in srgb, var(--warning) 14%, transparent)" }}>
                  INSIGHTS &amp; ADMIN
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Admin
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  Site-wide administration: manage who has a login at all, and review how the platform is
                  configured. This is a separate, higher-level layer from the per-project owner / editor /
                  reviewer / viewer roles described under{" "}
                  <a href="#ownership" onClick={(e) => { e.preventDefault(); goToSection("ownership"); }} style={{ color: "var(--accent-2)" }}>
                    Roles, ownership &amp; change requests
                  </a>
                  .
                </p>
                <div className="grid-2">
                  <div className="help-card">
                    <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 12 }}>Site-wide roles</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10 }}>
                        <span className="badge" style={{ color: "color-mix(in srgb, var(--accent-2) 55%, white)", background: "color-mix(in srgb, var(--accent-2) 14%, transparent)" }}>
                          Admin
                        </span>
                        <span className="muted" style={{ fontSize: "0.72rem" }}>
                          Sees every project as owner regardless of membership; the only role that can reach
                          this Admin page.
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10 }}>
                        <span className="badge">Member</span>
                        <span className="muted" style={{ fontSize: "0.72rem" }}>
                          No special site-wide access — what they can do on any given project depends
                          entirely on that project&apos;s Members page.
                        </span>
                      </div>
                    </div>
                    <div className="muted" style={{ fontSize: "0.7rem", marginTop: 12, lineHeight: 1.55 }}>
                      Under <strong style={{ color: "var(--text)" }}>Everyone with access</strong>, an admin can
                      click <strong style={{ color: "var(--text)" }}>Edit</strong> on any teammate to change
                      their site-wide role or reset their password (this also signs them out everywhere,
                      since a password reset invalidates their existing sessions).
                    </div>
                  </div>
                  <div className="help-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>System config</div>
                      <span className="badge">read-only</span>
                    </div>
                    {me?.role === "admin" ? (
                      adminConfig ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                            <span className="muted">Active model</span>
                            <code style={{ color: "#cbd5e1" }}>{adminConfig.model}</code>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                            <span className="muted">Credential encryption</span>
                            <span style={{ color: adminConfig.credentialEncryptionConfigured ? "var(--success)" : "var(--warning)" }}>
                              {adminConfig.credentialEncryptionConfigured ? "Enabled" : "Not configured"}
                            </span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                            <span className="muted">Default browser</span>
                            <span>
                              {adminConfig.defaultBrowser} · {adminConfig.defaultHeadless ? "headless" : "headed"}
                            </span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                            <span className="muted">Max parallel runs</span>
                            <span>{adminConfig.maxParallelRuns}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="muted" style={{ fontSize: "0.72rem" }}>
                          Loading...
                        </p>
                      )
                    ) : (
                      <p className="muted" style={{ fontSize: "0.72rem" }}>
                        Visible to admins on the{" "}
                        <a href="/admin" style={{ color: "var(--accent-2)" }}>
                          Admin
                        </a>{" "}
                        page.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {show("faq") && (
              <section
                className="help-section"
                ref={(el) => {
                  sectionRefs.current.faq = el;
                }}
              >
                <span className="help-section-badge" style={{ color: "var(--text-dim)", background: "var(--surface-2)" }}>
                  MORE
                </span>
                <h2 className="section-title" style={{ fontSize: "1.3rem", textTransform: "none", margin: "11px 0 6px" }}>
                  Frequently asked questions
                </h2>
                <p className="muted" style={{ maxWidth: 640, lineHeight: 1.6, marginBottom: 20 }}>
                  The short answers to what teams ask most when they start automating.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {FAQS.map((f, i) => (
                    <div className="help-faq-item" key={f.q}>
                      <button
                        className="help-faq-question"
                        onClick={() => setOpenFaq((prev) => (prev === i ? null : i))}
                      >
                        <span>{f.q}</span>
                        <ChevronDownIcon
                          size={16}
                          color="var(--text-dim)"
                          strokeWidth={2}
                          style={{ transition: "transform 0.18s", transform: openFaq === i ? "rotate(180deg)" : "none" }}
                        />
                      </button>
                      {openFaq === i && <div className="help-faq-answer">{f.a}</div>}
                    </div>
                  ))}
                </div>
                <div
                  className="help-hero"
                  style={{ marginTop: 24, padding: "18px 20px", display: "flex", alignItems: "center", gap: 13 }}
                >
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13, width: "100%" }}>
                    <div className="help-icon-tile" style={{ background: "linear-gradient(145deg, var(--accent), var(--accent-2))", flexShrink: 0 }}>
                      <UsersIcon size={19} color="var(--accent-ink)" strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>Still need a hand?</div>
                      <div className="muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>
                        Account, access, and configuration questions are handled by your workspace admin.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
