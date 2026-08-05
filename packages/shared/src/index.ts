// Shared domain + wire types used by both the backend and frontend.
// Kept independent of Prisma's generated types so the frontend never needs
// a Prisma dependency.

export type SelectorStrategy =
  | "role"
  | "label"
  | "text"
  | "placeholder"
  | "altText"
  | "testId"
  | "css"
  | "xpath";

/**
 * A resilient element descriptor. `description` is always populated and is
 * what the executor falls back to (via the agent) when re-matching against a
 * fresh Playwright MCP accessibility snapshot fails to find an exact hit --
 * accessibility refs are session-transient, so every replay re-resolves this
 * descriptor rather than storing a raw selector string.
 */
export interface ElementSelector {
  strategy: SelectorStrategy;
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  altText?: string;
  testId?: string;
  css?: string;
  xpath?: string;
  description: string;
}

export const TEST_STEP_ACTIONS = [
  "navigate",
  "click",
  "fill",
  "select",
  "check",
  "uncheck",
  "hover",
  "press",
  "waitFor",
  "assertVisible",
  "assertText",
  "assertUrl",
  "screenshot",
  // Enabled/disabled state, form validity, table/grid text, API response status, and a
  // lightweight accessible-name check -- see systemPrompt.ts for the `value` encoding
  // convention each of these expects.
  "assertEnabled",
  "assertDisabled",
  "assertFormValid",
  "assertTableContains",
  "assertApiResponse",
  "assertAccessible",
  // Pixel-level screenshot comparison against a stored baseline (see
  // VisualBaseline/VisualDiff) -- `value` optionally overrides the global
  // diff-percent threshold, e.g. "0.5". No baseline yet -> this run's
  // screenshot becomes the baseline (passes). A diff beyond threshold fails
  // and creates a pending VisualDiff for human review/approval, never
  // silently passed or auto-applied.
  "assertVisualMatch",
] as const;

export type TestStepAction = (typeof TEST_STEP_ACTIONS)[number];

export interface TestStepInput {
  order: number;
  action: TestStepAction;
  selector?: ElementSelector | null;
  locatorCandidates?: ElementSelector[] | null;
  value?: string | null;
  description: string;
  enabled?: boolean;
  /** Round-trips a step's flow provenance (see StepFlowProvenance) through a
   * save -- without this, saving unrelated test case edits would silently
   * drop the "came from Flow X" tag on any previously-inserted flow steps. */
  sourceFlowVersionId?: string | null;
}

/** Provenance for a step materialized by inserting a Flow -- the step is a
 * normal, concrete TestStep either way; this just lets the editor say "this
 * came from Flow X v{version}" and, when `isLatest` is false, offer an
 * explicit (never automatic) update to the newer version. */
export interface StepFlowProvenance {
  flowId: string;
  flowName: string;
  /** The specific FlowVersion this step was inserted from -- needed to call
   * the "update to latest" endpoint (which replaces steps tagged with this
   * exact version id). */
  versionId: string;
  version: number;
  isLatest: boolean;
}

export interface TestStepRecord extends TestStepInput {
  id: string;
  testCaseId: string;
  enabled: boolean;
  sourceFlow?: StepFlowProvenance | null;
}

export type TestCaseType =
  | "smoke"
  | "regression"
  | "functional"
  | "negative"
  | "ui"
  | "accessibility"
  | "edgeCase";

export type TestCasePriority = "low" | "medium" | "high" | "critical";

export type TestCaseStatus = "draft" | "approved" | "archived";

export interface TestCaseInput {
  title: string;
  objective: string;
  preconditions: string;
  testData: Record<string, unknown>;
  expectedResult: string;
  priority: TestCasePriority;
  type: TestCaseType;
  /** Free-text functional-area tag, e.g. "Authentication" -- null/absent shows as "Unassigned". */
  module?: string | null;
  /** Free-form multi-valued labels, editable like `module` but not limited to one. */
  tags?: string[];
  steps: TestStepInput[];
}

// ---------------------------------------------------------------------------
// Structured test data -- a CSV/JSON-imported data table for data-driven
// runs of one test case. Step values reference a column via
// `{{data.COLUMN}}`, resolved per-row at execution time. `secretColumns`
// names columns that must never appear in plaintext in a run's stored/
// displayed results or in an exported spec (same sensitivity class as
// Environment credentials).
// ---------------------------------------------------------------------------

export type TestDataSetSource = "csv" | "json";

export interface TestDataSetInput {
  columns: string[];
  secretColumns: string[];
  rows: Record<string, string>[];
  source: TestDataSetSource;
}

export interface TestDataSetRecord extends TestDataSetInput {
  id: string;
  testCaseId: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "admin" | "member";

export interface UserSummary {
  id: string;
  username: string;
  role: UserRole;
}

export interface TestCaseRecord extends Omit<TestCaseInput, "steps" | "tags"> {
  id: string;
  projectId: string;
  urlId: string | null;
  status: TestCaseStatus;
  steps: TestStepRecord[];
  createdBy: UserSummary | null;
  openChangeRequestCount: number;
  /** The literal chat prompt that produced this test case (captured once at
   * creation) -- shared asset documentation, distinct from the (private)
   * chat conversation itself. Null for test cases predating this field or
   * created some other way. */
  sourcePrompt: string | null;
  tags: string[];
  /** Bumped on every edit -- a change counter, not full diffable history
   * (see the schema comment on TestCase.version for why). */
  version: number;
  lastModifiedBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Reusable flows -- a named, versioned step sequence (e.g. "Login as
// standard user") that can be inserted into any test case in a project.
// Editing a flow creates a new immutable FlowVersion rather than mutating
// existing ones, so a test case that already inserted a version keeps
// running exactly what it inserted until someone explicitly updates it.
// ---------------------------------------------------------------------------

export interface FlowVersionRecord {
  id: string;
  flowId: string;
  version: number;
  steps: TestStepInput[];
  note: string | null;
  createdBy: UserSummary | null;
  createdAt: string;
}

export interface FlowInput {
  name: string;
  description?: string | null;
}

/** Lightweight row for a project's flow list -- avoids shipping every
 * version's full step list just to render a list. */
export interface FlowSummary {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdBy: UserSummary | null;
  latestVersion: number;
  latestStepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowRecord {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdBy: UserSummary | null;
  versions: FlowVersionRecord[]; // ascending by version
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Change requests -- a non-owner flagging an issue on a test case for the
// owner to act on. Mirrors the HealingEvent pattern: a durable, human-
// reviewable queue rather than an external notification channel.
// ---------------------------------------------------------------------------

export type ChangeRequestStatus = "open" | "resolved";

export interface ChangeRequestRecord {
  id: string;
  testCaseId: string;
  testCaseTitle: string;
  requestedBy: UserSummary;
  note: string;
  status: ChangeRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export type RunStatus = "pending" | "running" | "passed" | "failed" | "error" | "skipped";

export interface ScreenshotRecord {
  id: string;
  testRunResultId: string;
  stepOrder: number;
  filePath: string;
  takenAt: string;
}

export type ExecutionLogCategory = "execution" | "console" | "network";

export interface ExecutionLogRecord {
  id: string;
  testRunId: string;
  level: "info" | "warn" | "error";
  category: ExecutionLogCategory;
  message: string;
  timestamp: string;
}

export interface TestRunResultRecord {
  id: string;
  testRunId: string;
  testStepId: string;
  stepOrder: number;
  /** Snapshotted from the step's action at run time (a step can be
   * edited/reordered after a run) -- null only for rows that predate this
   * field. Used e.g. to show a "review visual diff" link on a failed
   * assertVisualMatch step without a separate lookup. */
  action: TestStepAction | null;
  status: RunStatus;
  actualResult: string | null;
  errorMessage: string | null;
  suggestedFix: string | null;
  recovered: boolean;
  durationMs: number;
  /** The page URL captured right after this step ran. Null if capture failed
   * or the step doesn't apply (e.g. skipped). Never includes storage state
   * (cookies/localStorage) -- that's server-side only, same sensitivity
   * class as Environment credentials. */
  pageUrl: string | null;
  screenshots: ScreenshotRecord[];
}

export interface TestRunRecord {
  id: string;
  testCaseId: string;
  environmentId: string | null;
  batchId: string | null;
  status: RunStatus;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  /** Real Playwright trace/video file paths (relative, servable under
   * `/artifacts/*`), captured via the Playwright MCP devtools capability.
   * Null if capture failed or wasn't supported -- fall back to the
   * reconstructed Trace tab timeline in that case. */
  tracePath: string | null;
  videoPath: string | null;
  /** This run's session was seeded with the chat session's storage state
   * before its first step (opt-in, requested at run-start time). */
  continuedFromChat: boolean;
  /** Set when this run was started via "rerun from step N". Steps before
   * resumedFromStepOrder were not re-executed this run -- see
   * `inheritedResults` for their outcome, inherited from resumedFromRunId. */
  resumedFromRunId: string | null;
  resumedFromStepOrder: number | null;
  /** Populated only by GET /api/testruns/:id: the source run's results for
   * steps before resumedFromStepOrder, for display as "inherited, not
   * re-verified this run" rather than omitted entirely. Empty otherwise. */
  inheritedResults: TestRunResultRecord[];
  /** Which row of the test case's TestDataSet this run used ("run with
   * data"). Null for a normal (non-data-driven) run. */
  dataRowIndex: number | null;
  results: TestRunResultRecord[];
  logs: ExecutionLogRecord[];
  /** One entry per tracker type this run has ever been pushed to (usually
   * 0 or 1 -- multiple only if the project has more than one integration
   * configured and both were used). */
  issuePushes: IssuePushRecord[];
}

// ---------------------------------------------------------------------------
// Issue-tracker integrations -- per-project connection config (Jira today;
// githubIssues/azureDevOps reserved for a mock adapter proving the interface
// is extensible). JiraPush is a durable, per-TestRun record of whether that
// run's failure has already been pushed, same "reviewable record, not a
// notification" pattern as HealingEvent/ChangeRequest.
// ---------------------------------------------------------------------------

export type IntegrationType = "jira" | "githubIssues" | "azureDevOps";

export interface IntegrationSummary {
  id: string;
  projectId: string;
  type: IntegrationType;
  baseUrl: string;
  email: string;
  projectKey: string;
  hasApiToken: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationInput {
  baseUrl: string;
  email: string;
  projectKey: string;
  /** Optional on update -- omit to keep the currently-stored token; required
   * the first time an integration is configured. */
  apiToken?: string;
}

export type IssuePushStatus = "pending" | "pushed" | "failed";

/** One push attempt of a run's failure to an external tracker. Named
 * generically (not JiraPushRecord) since `type` can be any configured
 * `IntegrationType` -- the underlying DB table is still physically named
 * JiraPush (predates multi-tracker support), but that's an implementation
 * detail this type doesn't need to carry. */
export interface IssuePushRecord {
  id: string;
  testRunId: string;
  type: IntegrationType;
  status: IssuePushStatus;
  issueKey: string | null;
  issueUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  pushedAt: string | null;
}

export interface TargetUrlRecord {
  id: string;
  projectId: string;
  url: string;
  title: string | null;
  lastInspectedAt: string | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  urls: TargetUrlRecord[];
  /** The requesting user's effective role on this project ("owner" for a
   * global admin, regardless of membership). Populated only by the routes
   * that already know who's asking (list/get) -- undefined elsewhere. */
  myRole?: ProjectRole;
}

// ---------------------------------------------------------------------------
// Per-project RBAC -- "owner" (manage membership/credentials/delete),
// "editor" (create/edit/run/delete test cases, environments, flows),
// "reviewer" (read-only + run, plus approve/reject a test case someone else
// authored -- see the dedicated review action on TestCase; a reviewer cannot
// edit test content, and an editor/owner cannot approve their own test case
// through the normal edit path, closing the segregation-of-duties gap),
// "viewer" (read-only + run). Rank order for `roleMeets` is
// viewer < reviewer < editor < owner; the review action itself is gated by
// an explicit owner-or-reviewer check rather than rank, since editor
// shouldn't inherit it. A global admin bypasses membership checks entirely
// and is treated as "owner" everywhere.
// ---------------------------------------------------------------------------

export const PROJECT_ROLES = ["owner", "editor", "reviewer", "viewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export interface ProjectMemberRecord {
  id: string;
  projectId: string;
  user: UserSummary;
  role: ProjectRole;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Audit log -- durable record of who did what, for the security-relevant
// actions (membership changes, credential updates, deletions). Free-text
// `action`/`detail` rather than a rigid enum, since the set of audit-worthy
// actions keeps growing and this is a read-mostly log, not a domain entity.
// ---------------------------------------------------------------------------

export interface AuditLogEntryRecord {
  id: string;
  userId: string | null;
  username: string | null;
  projectId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ChatMessageRecord {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Agent activity -- a durable, per-chat-turn timeline of what the agent is
// actually doing (as opposed to the ephemeral single-string "status" this
// replaced). `turnId` groups every event from one `chat.send` call, in order.
// `stage` is derived honestly from what's actually happening server-side --
// there's no separate "generating automation script" or "validating" step in
// this pipeline (script export is a distinct, on-demand action elsewhere),
// so those aren't modeled here. Persisted (AgentActivityEvent) specifically
// so a page refresh mid-turn can reconstruct the timeline instead of losing
// it, then live WS events (`agent.activity`) append to it from there.
// ---------------------------------------------------------------------------

export const AGENT_TURN_STAGES = [
  "queued",
  "understanding",
  "analyzing",
  "generating_test_cases",
  "completed",
  "waiting_for_user",
  "failed",
  "cancelled",
] as const;
export type AgentTurnStage = (typeof AGENT_TURN_STAGES)[number];

/** Terminal stages -- once one of these appears for a turnId, that turn is
 * done and nothing further will arrive for it. */
export const TERMINAL_AGENT_STAGES: readonly AgentTurnStage[] = [
  "completed",
  "waiting_for_user",
  "failed",
  "cancelled",
];

export interface AgentActivityEventRecord {
  id: string;
  projectId: string;
  turnId: string;
  stage: AgentTurnStage;
  label: string;
  detail: string | null;
  toolName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Token usage + cost tracking -- one row per Anthropic API call, so a
// project's total spend can be broken down or aggregated on demand.
// ---------------------------------------------------------------------------

export type TokenUsageSource = "chat" | "failure_explanation" | "selector_recovery" | "step_generation";

export interface TokenUsageRecord {
  id: string;
  projectId: string;
  source: TokenUsageSource;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  createdAt: string;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Environments -- per-project execution config (base URL, browser, viewport,
// credentials). Distinct from TargetUrl, which is what chat exploration and
// test-case generation target; Environment governs what execution uses.
// ---------------------------------------------------------------------------

export type BrowserName = "chromium" | "firefox" | "webkit";

export interface EnvironmentInput {
  name: string;
  baseUrl: string;
  browser: BrowserName;
  headless: boolean;
  viewportWidth: number;
  viewportHeight: number;
  isDefault: boolean;
}

export interface EnvironmentRecord extends EnvironmentInput {
  id: string;
  projectId: string;
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Self-healing -- durable, reviewable record of every time selector
// resolution had to fall back beyond the primary selector + stored
// candidates, so a human can approve/dismiss before it's applied permanently.
// ---------------------------------------------------------------------------

export interface DashboardRecentRun {
  id: string;
  testCaseId: string;
  testCaseTitle: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Failing Tests -- a full, uncapped view of the dashboard's "Failing Tests by
// Priority" card. Deliberately not "Defect Intelligence": no bug-tracker
// entity (severity/clustering/lifecycle) exists, so this is just every test
// case whose latest run failed, not a fabricated defect list.
// ---------------------------------------------------------------------------

export interface FailingTestRecord {
  id: string;
  title: string;
  priority: TestCasePriority;
  module: string | null;
  latestRun: {
    id: string;
    status: RunStatus;
    errorMessage: string | null;
    finishedAt: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Reports & Analytics -- real time-series aggregated from existing TestRun
// rows (grouped by calendar day), no new tables.
// ---------------------------------------------------------------------------

export interface ReportsDayPoint {
  date: string;
  passed: number;
  failed: number;
  skipped: number;
  avgDurationMs: number;
}

export interface ReportsSummary {
  timeSeriesDays: ReportsDayPoint[];
}

// ---------------------------------------------------------------------------
// Admin -- read-only, non-secret system configuration, visible to admins on
// the Admin page (which also hosts team/user management).
// ---------------------------------------------------------------------------

export interface AdminConfig {
  model: string;
  credentialEncryptionConfigured: boolean;
  defaultBrowser: string;
  defaultHeadless: boolean;
  maxParallelRuns: number;
  /** Whether WEBHOOK_URL is set -- never the URL itself, since it's often a
   * bearer-token-bearing secret (e.g. a Slack incoming webhook URL). */
  webhookConfigured: boolean;
}

export type ActivityKind = "generated" | "run_completed" | "healed" | "change_requested";

export interface ActivityItem {
  kind: ActivityKind;
  message: string;
  detail?: string;
  timestamp: string;
  href?: string;
}

export interface ModuleCoverage {
  module: string;
  testCount: number;
  passRate: number | null;
}

export interface DashboardTrend {
  testHealthDelta: number | null;
  automationCoverageDelta: number | null;
  releaseReadinessDelta: number | null;
}

export interface DashboardSummary {
  totalTestCases: number;
  testCasesByStatus: Record<string, number>;
  testCasesByType: Record<string, number>;
  recentRuns: DashboardRecentRun[];
  passCount: number;
  failCount: number;
  skipCount: number;
  flakyTestCaseIds: string[];
  averageDurationMs: number;
  averageDurationSampleSize: number;
  releaseReadinessScore: number;
  openChangeRequestCount: number;
  openChangeRequests: ChangeRequestRecord[];
  testHealthScore: number;
  automationCoveragePercent: number;
  /** Clearly an estimate -- see packages/backend/src/dashboard/timeSavedEstimate.ts. */
  timeSavedHours: number;
  timeSavedUsd: number;
  healedLocatorCount: number;
  maxParallelRuns: number;
  trend: DashboardTrend;
  failingTestsByPriority: Record<TestCasePriority, number>;
  failingTests: { id: string; title: string; priority: TestCasePriority }[];
  coverageByModule: ModuleCoverage[];
  recentActivity: ActivityItem[];
}

/** Structured stand-in for a native Playwright trace/video file -- the
 * current Playwright MCP tool surface exposes console/network capture but no
 * tracing-start/stop or video-recording tool, so this assembles the
 * equivalent from step results, screenshots, and console/network logs. */
export interface TraceBundle {
  testRun: TestRunRecord;
  consoleLogs: ExecutionLogRecord[];
  networkLogs: ExecutionLogRecord[];
}

// ---------------------------------------------------------------------------
// Visual regression -- a pixel-diff beyond threshold between an
// assertVisualMatch step's screenshot and its stored baseline. Durable,
// human-reviewable record (same "nothing applied without an explicit action"
// pattern as HealingEvent/ChangeRequest): approving promotes the diff's
// actual screenshot to be the new baseline; rejecting leaves it as-is.
// ---------------------------------------------------------------------------

export type VisualDiffStatus = "pending" | "approved" | "rejected";

export interface VisualDiffRecord {
  id: string;
  testStepId: string;
  testRunResultId: string;
  baselinePath: string;
  actualPath: string;
  diffPath: string;
  diffPercent: number;
  status: VisualDiffStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface HealingEventRecord {
  id: string;
  testStepId: string;
  testRunResultId: string;
  oldSelector: ElementSelector;
  newSelector: ElementSelector;
  confidence: "high" | "low";
  note: string;
  screenshotPath: string | null;
  approved: boolean;
  dismissed: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// WebSocket wire protocol -- one channel per project, multiplexing chat and
// live execution progress.
// ---------------------------------------------------------------------------

export type ClientToServerMessage =
  | { type: "chat.send"; text: string; urlId?: string; environmentId?: string }
  | { type: "chat.cancel"; turnId: string }
  | { type: "run.start"; testCaseId: string; environmentId?: string; continueFromChatSession?: boolean }
  | { type: "run.rerunFailed"; testRunId: string; resumeFromStepOrder?: number };

export type ServerToClientMessage =
  | { type: "chat.delta"; text: string; turnId: string }
  | { type: "chat.message"; message: ChatMessageRecord }
  | { type: "agent.activity"; event: AgentActivityEventRecord }
  | { type: "testcases.proposed"; testCases: TestCaseRecord[] }
  | { type: "testcases.updated"; testCase: TestCaseRecord }
  | {
      type: "run.progress";
      testRunId: string;
      stepOrder: number;
      status: RunStatus;
      message?: string;
      batchId?: string | null;
    }
  | { type: "run.completed"; testRun: TestRunRecord }
  | { type: "usage.update"; usage: TokenUsageRecord; totals: UsageTotals }
  | { type: "healing.detected"; healingEvent: HealingEventRecord }
  | { type: "error"; message: string };
