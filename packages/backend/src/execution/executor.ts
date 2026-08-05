import type { ElementSelector, RunStatus, TestRunRecord } from "@testingmcp/shared";
import { prisma } from "../db/client";
import { serializeTestRun } from "../db/serializers";
import { getEnvironmentForExecution } from "../db/environmentRepo";
import { createHealingEvent } from "../db/healingRepo";
import { chatSessionKey, mcpManager, type SessionConfig } from "../mcp/mcpManager";
import { mcpResultToText } from "../mcp/toolConversion";
import { explainFailure } from "../agent/agentService";
import { extractUrlFromSnapshot, resolveElement, type ResolvedElement } from "./selectorResolution";
import { captureScreenshot } from "./screenshots";
import { captureDiagnostics } from "./diagnostics";
import { startDiagnosticsCapture, stopDiagnosticsCapture } from "./traceCapture";
import { captureStorageState, capturePageUrl, restoreStorageState } from "./storageState";
import { extractEvaluateResultValue } from "./evaluateUtils";
import { sendRunFailureWebhook } from "./webhookNotifier";
import { checkVisualMatch } from "./visualRegression";
import { logger } from "../utils/logger";
import type { Emit } from "../agent/agentService";

const include = {
  results: { include: { screenshots: true } },
  logs: true,
} as const;

async function log(testRunId: string, level: "info" | "warn" | "error", message: string) {
  await prisma.executionLog.create({ data: { testRunId, level, message } });
}

export interface ExecuteOptions {
  environmentId?: string;
  batchId?: string;
  /** Seeds the fresh execution session with the *triggering user's own*
   * chat-exploration session's storage state (cookies/localStorage) before
   * the first step, e.g. to skip re-login if chat already authenticated.
   * No-ops if there's no live chat session for this project *and this
   * user* -- chat sessions are per-user, so this never inherits someone
   * else's exploration session even if they were also chatting on the same
   * project. Requires `userId` to resolve which session that is. */
  continueFromChatSession?: boolean;
  /** The user who triggered this run -- needed to resolve their own chat
   * session for `continueFromChatSession` above. Not otherwise used (a run
   * itself isn't attributed to a user anywhere yet). */
  userId?: string;
  /** "Rerun from step N": steps before stepOrder are not re-executed --
   * their outcome is inherited from `runId`. The fresh session is instead
   * seeded with the storage state + URL captured after the last inherited
   * step (stepOrder - 1), which must have passed in that source run. */
  resumeFrom?: { runId: string; stepOrder: number };
  /** "Run with data": this run uses one row of the test case's TestDataSet.
   * `secretColumns` drives masking of that row's sensitive values out of
   * stored/displayed run text (see maskedDisplayValue below). */
  dataRow?: { index: number; values: Record<string, string>; secretColumns: string[] };
}

/** Executes every step of a TestCase against a fresh, isolated Playwright MCP
 * session. Stops at the first failing step (later steps almost always
 * depend on earlier ones having succeeded) but always finalizes the run. */
export async function executeTestCase(
  testCaseId: string,
  triggeredBy: "user" | "rerun" | "batch",
  emit?: Emit,
  options: ExecuteOptions = {},
): Promise<TestRunRecord> {
  const testCase = await prisma.testCase.findUniqueOrThrow({
    where: { id: testCaseId },
    include: { steps: true, url: true },
  });

  const environment = options.environmentId
    ? await getEnvironmentForExecution(options.environmentId)
    : null;

  const run = await prisma.testRun.create({
    data: {
      testCaseId,
      status: "running",
      triggeredBy,
      environmentId: options.environmentId ?? null,
      batchId: options.batchId ?? null,
      // Set explicitly (rather than relying on the schema's @default(now()),
      // which SQLite resolves via CURRENT_TIMESTAMP at only 1-second
      // resolution) so it's directly comparable in millisecond precision to
      // `finishedAt` below -- otherwise fast runs can appear to finish before
      // they started, producing a negative duration on the dashboard.
      startedAt: new Date(),
    },
  });
  const sessionKey = `run:${run.id}`;
  const sessionConfig: SessionConfig | undefined = environment
    ? {
        browser: environment.browser,
        headless: environment.headless,
        viewportWidth: environment.viewportWidth,
        viewportHeight: environment.viewportHeight,
      }
    : undefined;
  // Acquired unconditionally (not just when a custom environment is set) so
  // the session exists before diagnostics capture starts and before any
  // inherited-state seeding below runs.
  await mcpManager.getSession(sessionKey, sessionConfig);
  await startDiagnosticsCapture(sessionKey);

  await log(run.id, "info", `Starting run for "${testCase.title}" (${triggeredBy}).`);

  let overallStatus: RunStatus = "passed";
  const steps = testCase.steps.slice().sort((a, b) => a.order - b.order);
  const fallbackUrl = testCase.url?.url ?? environment?.baseUrl ?? null;

  const inherited = await resolveInheritedState(testCase.projectId, options);
  if (inherited.state) {
    await restoreStorageState(sessionKey, inherited.state);
    if (inherited.url) {
      try {
        await callToolChecked(sessionKey, "browser_navigate", { url: inherited.url });
      } catch (err) {
        logger.warn(`executor: failed to navigate resumed session to inherited URL: ${(err as Error).message}`);
      }
    }
  }

  const stepsToRun = options.resumeFrom
    ? steps.filter((s) => s.order >= options.resumeFrom!.stepOrder)
    : steps;

  for (const step of stepsToRun) {
    const startedAt = Date.now();
    const result = await prisma.testRunResult.create({
      data: {
        testRunId: run.id,
        testStepId: step.id,
        stepOrder: step.order,
        action: step.action,
        status: "running",
        durationMs: 0,
      },
    });

    if (!step.enabled) {
      await prisma.testRunResult.update({
        where: { id: result.id },
        data: { status: "skipped", actualResult: "Step is disabled.", durationMs: 0 },
      });
      emit?.({ type: "run.progress", testRunId: run.id, stepOrder: step.order, status: "skipped", batchId: run.batchId });
      continue;
    }

    emit?.({ type: "run.progress", testRunId: run.id, stepOrder: step.order, status: "running", batchId: run.batchId });

    try {
      const actualResult = await runStep(
        sessionKey,
        step,
        result.id,
        fallbackUrl,
        testCase.projectId,
        environment?.credentials ?? {},
        options.dataRow?.values ?? {},
        new Set(options.dataRow?.secretColumns ?? []),
      );
      const durationMs = Date.now() - startedAt;

      // Best-effort: lets a later "rerun from step N" restore this step's
      // end state instead of replaying steps 1..N-1. Never blocks/fails the
      // step itself.
      const [stateSnapshot, pageUrl] = await Promise.all([
        captureStorageState(sessionKey),
        capturePageUrl(sessionKey),
      ]);

      await prisma.testRunResult.update({
        where: { id: result.id },
        data: {
          status: "passed",
          actualResult: actualResult.text,
          recovered: actualResult.recovered,
          durationMs,
          storageStateJson: stateSnapshot ? JSON.stringify(stateSnapshot) : null,
          pageUrl,
        },
      });
      const screenshot = await captureScreenshot(sessionKey, result.id, step.order);

      if (actualResult.recovered && actualResult.resolved?.matchedSelector && step.selector) {
        try {
          await createHealingEvent({
            testStepId: step.id,
            testRunResultId: result.id,
            oldSelector: JSON.parse(step.selector) as ElementSelector,
            newSelector: actualResult.resolved.matchedSelector,
            confidence: actualResult.resolved.confidence ?? "low",
            note: actualResult.resolved.note ?? "Selector automatically recovered.",
            screenshotPath: screenshot?.filePath ?? null,
          });
        } catch (healingErr) {
          logger.warn(`executor: failed to record healing event: ${(healingErr as Error).message}`);
        }
      }

      await log(run.id, "info", `Step ${step.order} (${step.action}) passed: ${step.description}`);
      emit?.({ type: "run.progress", testRunId: run.id, stepOrder: step.order, status: "passed", batchId: run.batchId });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = (err as Error).message;
      await captureScreenshot(sessionKey, result.id, step.order);

      let suggestedFix = "Review the step manually.";
      try {
        const snapshotText = await safeSnapshotText(sessionKey);
        const explanation = await explainFailure({
          projectId: testCase.projectId,
          stepDescription: step.description,
          action: step.action,
          errorMessage,
          pageSnapshot: snapshotText,
        });
        suggestedFix = explanation.suggestedFix;
        await prisma.testRunResult.update({
          where: { id: result.id },
          data: {
            status: "failed",
            errorMessage: `${errorMessage}\n\nWhy it likely failed: ${explanation.explanation}`,
            suggestedFix,
            durationMs,
          },
        });
      } catch (explainErr) {
        logger.warn(`executor: failure explanation call failed: ${(explainErr as Error).message}`);
        await prisma.testRunResult.update({
          where: { id: result.id },
          data: { status: "failed", errorMessage, suggestedFix, durationMs },
        });
      }

      await log(run.id, "error", `Step ${step.order} (${step.action}) failed: ${errorMessage}`);
      emit?.({
        type: "run.progress",
        testRunId: run.id,
        stepOrder: step.order,
        status: "failed",
        message: errorMessage,
        batchId: run.batchId,
      });
      overallStatus = "failed";
      break; // remaining steps depend on this one; stop the run here
    }
  }

  const diagnosticsCapture = await stopDiagnosticsCapture(sessionKey);
  await captureDiagnostics(sessionKey, run.id);
  await mcpManager.closeSession(sessionKey);

  await prisma.testRun.update({
    where: { id: run.id },
    data: {
      status: overallStatus,
      finishedAt: new Date(),
      tracePath: diagnosticsCapture.tracePath,
      videoPath: diagnosticsCapture.videoPath,
      continuedFromChat: !!options.continueFromChatSession,
      resumedFromRunId: options.resumeFrom?.runId ?? null,
      resumedFromStepOrder: options.resumeFrom?.stepOrder ?? null,
      dataRowIndex: options.dataRow?.index ?? null,
    },
    include,
  });
  await log(run.id, "info", `Run finished: ${overallStatus}.`);

  const record = serializeTestRun(await prisma.testRun.findUniqueOrThrow({ where: { id: run.id }, include }));
  emit?.({ type: "run.completed", testRun: record });
  if (overallStatus !== "passed") {
    await sendRunFailureWebhook(record, testCase.title);
  }
  return record;
}

/** Resolves what (if anything) this run should seed its fresh session with:
 * either the storage state + URL captured after the last step of a prior
 * run's execution (a resume), or the current chat-exploration session's
 * storage state + URL (opt-in "continue from chat"). Resume takes priority
 * if somehow both were requested. Both branches are best-effort -- a miss
 * just means the run starts clean, exactly as it did before this feature. */
async function resolveInheritedState(
  projectId: string,
  options: ExecuteOptions,
): Promise<{ state: Record<string, unknown> | null; url: string | null }> {
  if (options.resumeFrom) {
    const sourceResult = await prisma.testRunResult.findFirst({
      where: {
        testRunId: options.resumeFrom.runId,
        stepOrder: options.resumeFrom.stepOrder - 1,
        status: "passed",
      },
    });
    if (!sourceResult) return { state: null, url: null };
    return {
      state: sourceResult.storageStateJson ? (JSON.parse(sourceResult.storageStateJson) as Record<string, unknown>) : null,
      url: sourceResult.pageUrl,
    };
  }

  if (options.continueFromChatSession && options.userId) {
    const chatKey = chatSessionKey(projectId, options.userId);
    if (mcpManager.hasSession(chatKey)) {
      const [state, url] = await Promise.all([captureStorageState(chatKey), capturePageUrl(chatKey)]);
      return { state, url };
    }
  }

  return { state: null, url: null };
}

export async function rerunFailedTestRun(
  testRunId: string,
  emit?: Emit,
  resumeFromStepOrder?: number,
): Promise<TestRunRecord> {
  const previous = await prisma.testRun.findUniqueOrThrow({ where: { id: testRunId } });
  return executeTestCase(previous.testCaseId, "rerun", emit, {
    environmentId: previous.environmentId ?? undefined,
    resumeFrom: resumeFromStepOrder ? { runId: previous.id, stepOrder: resumeFromStepOrder } : undefined,
  });
}

/** Runs every approved test case in a project with a small concurrency cap
 * (no new queue dependency -- just a chunked Promise.allSettled), tagging
 * every run with a shared batchId so the UI can group live progress. */
export async function runApprovedTestCasesBatch(
  projectId: string,
  environmentId: string | undefined,
  concurrency: number,
  emit?: Emit,
  continueFromChatSession?: boolean,
  userId?: string,
): Promise<{ batchId: string; testRunIds: string[] }> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const testCases = await prisma.testCase.findMany({
    where: { projectId, status: "approved" },
    select: { id: true },
  });

  const testRunIds: string[] = [];
  for (let i = 0; i < testCases.length; i += concurrency) {
    const chunk = testCases.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map((tc) =>
        executeTestCase(tc.id, "batch", emit, { environmentId, batchId, continueFromChatSession, userId }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") testRunIds.push(result.value.id);
      else logger.error("executor: batch run failed for a test case", result.reason);
    }
  }

  return { batchId, testRunIds };
}

/** Runs one test case once per row of its TestDataSet, each row producing
 * its own TestRun tagged with dataRowIndex, all sharing a batchId (same
 * grouping mechanism as "Run all"). Throws if the test case has no dataset
 * -- callers should check for one first (e.g. via the data-set route). */
export async function runTestCaseAcrossDataSet(
  testCaseId: string,
  environmentId: string | undefined,
  concurrency: number,
  emit?: Emit,
): Promise<{ batchId: string; testRunIds: string[] }> {
  const dataSet = await prisma.testDataSet.findUnique({ where: { testCaseId } });
  if (!dataSet) {
    throw new Error("This test case has no test data set to run with.");
  }
  const rows = JSON.parse(dataSet.rows) as Record<string, string>[];
  const secretColumns = JSON.parse(dataSet.secretColumns) as string[];
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const testRunIds: string[] = [];
  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency).map((values, offset) => ({ index: i + offset, values }));
    const results = await Promise.allSettled(
      chunk.map(({ index, values }) =>
        executeTestCase(testCaseId, "batch", emit, {
          environmentId,
          batchId,
          dataRow: { index, values, secretColumns },
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") testRunIds.push(result.value.id);
      else logger.error("executor: data-driven run failed for a row", result.reason);
    }
  }

  return { batchId, testRunIds };
}

async function safeSnapshotText(sessionKey: string): Promise<string> {
  try {
    const snap = await mcpManager.callTool(sessionKey, "browser_snapshot", {});
    return mcpResultToText(snap);
  } catch {
    return "(no snapshot available)";
  }
}

interface StepOutcome {
  text: string;
  recovered: boolean;
  resolved?: ResolvedElement;
}

// assertUrl/assertText run right after actions that can trigger a page
// navigation (e.g. clicking a submit button); the click itself resolves
// before the resulting navigation settles, so a single immediate snapshot
// can race the redirect. Poll for a bounded window instead of failing fast.
const ASSERTION_POLL_TIMEOUT_MS = 8000;
const ASSERTION_POLL_INTERVAL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ENV_PLACEHOLDER = /\{\{\s*env\.([\w-]+)\s*\}\}/g;
const DATA_PLACEHOLDER = /\{\{\s*data\.([\w-]+)\s*\}\}/g;

/** Substitutes `{{env.KEY}}` placeholders with decrypted environment
 * credential values, so a generated login step can reference stored secrets
 * without them ever passing through chat/LLM context. */
function substituteCredentials(value: string | null, credentials: Record<string, string>): string | null {
  if (!value) return value;
  return value.replace(ENV_PLACEHOLDER, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(credentials, key) ? credentials[key] : `{{env.${key}}}`,
  );
}

/** Substitutes `{{data.COLUMN}}` placeholders with this run's data-set row
 * value, for "run with data" (empty `row` on a normal run -- every
 * `{{data.*}}` placeholder is then simply left as-is, same as an
 * unconfigured `{{env.*}}` one). */
function substituteDataRow(value: string | null, row: Record<string, string>): string | null {
  if (!value) return value;
  return value.replace(DATA_PLACEHOLDER, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(row, key) ? row[key] : `{{data.${key}}}`,
  );
}

/** Builds the human-facing display text for a step's value: `{{env.*}}`
 * placeholders are always masked (Environment credentials never appear in
 * plaintext in a stored/returned TestRunResult, matching the same invariant
 * already enforced for chat/LLM context), and `{{data.*}}` placeholders are
 * masked only when that column was flagged secret when the data set was
 * uploaded -- non-secret data columns still resolve to their real value so
 * the result reads naturally (e.g. `Filled Search field with "iPhone 15"`). */
function maskedDisplayValue(
  rawTemplate: string | null,
  row: Record<string, string>,
  secretColumns: Set<string>,
): string {
  if (!rawTemplate) return rawTemplate ?? "";
  let masked = rawTemplate.replace(ENV_PLACEHOLDER, "••••••");
  masked = masked.replace(DATA_PLACEHOLDER, (match, key: string) =>
    secretColumns.has(key) ? "••••••" : match,
  );
  return substituteDataRow(masked, row) ?? "";
}

/** mcpManager.callTool resolves (rather than throws) on a tool-level failure
 * (e.g. bad arguments, element not actionable) and signals it via
 * `isError` -- callers that don't check that flag would otherwise treat the
 * step as having succeeded. */
async function callToolChecked(
  sessionKey: string,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  const result = await mcpManager.callTool(sessionKey, name, args);
  if (result.isError) {
    throw new Error(mcpResultToText(result) || `Tool "${name}" reported an error.`);
  }
}

/** Runs a `(element) => ...` function scoped to a resolved element via
 * `browser_evaluate`'s `target`/`element` params (confirmed live against a
 * running Playwright MCP session: `target` accepts the same snapshot `ref`
 * used by browser_click/browser_type, and `function` then receives the DOM
 * node as its argument). Returns just the extracted result value, not the
 * tool's full formatted text output. */
async function evaluateOnElement(
  sessionKey: string,
  elementDescription: string,
  target: string,
  fn: string,
): Promise<string> {
  const result = await mcpManager.callTool(sessionKey, "browser_evaluate", {
    element: elementDescription,
    target,
    function: fn,
  });
  if (result.isError) {
    throw new Error(mcpResultToText(result) || "browser_evaluate reported an error.");
  }
  return extractEvaluateResultValue(mcpResultToText(result));
}

// Lightweight accessible-name heuristic used by `assertAccessible` -- checks
// alt text (img), an associated label/aria-label/aria-labelledby (form
// controls), or non-empty accessible text (everything else). This mirrors
// the concept behind Playwright's own accessible-name computation (which is
// what already powers role/name-based selector matching in
// selectorResolution.ts) but is NOT a full axe-core-equivalent audit -- no
// contrast, focus-order, or ARIA-validity checks. Consistent with this
// repo's existing "don't oversell partial functionality" convention (see the
// README's disclaimer that the Trace tab is a reconstruction, not a literal
// Playwright trace file).
const ACCESSIBLE_NAME_CHECK_FN =
  "(element) => { " +
  "const tag = element.tagName.toLowerCase(); " +
  "const ariaLabel = element.getAttribute('aria-label') || ''; " +
  "const labelledBy = element.getAttribute('aria-labelledby'); " +
  "let labelledText = ''; " +
  "if (labelledBy) { labelledText = labelledBy.split(' ').map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; }).join(' '); } " +
  "let name = ''; " +
  "if (tag === 'img') { name = element.getAttribute('alt') || ''; } " +
  "else if (tag === 'input' || tag === 'select' || tag === 'textarea') { var lbl = (element.labels && element.labels.length > 0) ? element.labels[0].textContent : ''; name = ariaLabel || labelledText || lbl || ''; } " +
  "else { name = ariaLabel || labelledText || element.textContent || ''; } " +
  "return String(!!name.trim()); " +
  "}";

async function runStep(
  sessionKey: string,
  step: {
    id: string;
    action: string;
    selector: string | null;
    locatorCandidates: string | null;
    value: string | null;
    description: string;
  },
  testRunResultId: string,
  fallbackUrl: string | null,
  projectId: string,
  credentials: Record<string, string>,
  dataRow: Record<string, string>,
  secretColumns: Set<string>,
): Promise<StepOutcome> {
  const selector: ElementSelector | null = step.selector ? JSON.parse(step.selector) : null;
  const candidates: ElementSelector[] | null = step.locatorCandidates
    ? JSON.parse(step.locatorCandidates)
    : null;
  const value = substituteDataRow(substituteCredentials(step.value, credentials), dataRow);
  const displayValue = maskedDisplayValue(step.value, dataRow, secretColumns);

  switch (step.action) {
    case "navigate": {
      const url = value || fallbackUrl;
      if (!url) throw new Error("navigate step has no URL and the test case has no target URL");
      await callToolChecked(sessionKey, "browser_navigate", { url });
      return { text: `Navigated to ${url}`, recovered: false };
    }

    case "click":
    case "check":
    case "uncheck": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      await callToolChecked(sessionKey, "browser_click", {
        element: el.description,
        target: resolved.ref,
      });
      return { text: `Clicked ${el.description}`, recovered: resolved.recovered, resolved };
    }

    case "hover": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      await callToolChecked(sessionKey, "browser_hover", {
        element: el.description,
        target: resolved.ref,
      });
      return { text: `Hovered ${el.description}`, recovered: resolved.recovered, resolved };
    }

    case "fill": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      await callToolChecked(sessionKey, "browser_type", {
        element: el.description,
        target: resolved.ref,
        text: value ?? "",
      });
      return { text: `Filled ${el.description} with "${displayValue}"`, recovered: resolved.recovered, resolved };
    }

    case "select": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      await callToolChecked(sessionKey, "browser_select_option", {
        element: el.description,
        target: resolved.ref,
        values: [value ?? ""],
      });
      return { text: `Selected "${displayValue}" in ${el.description}`, recovered: resolved.recovered, resolved };
    }

    case "press": {
      await callToolChecked(sessionKey, "browser_press_key", { key: value ?? "Enter" });
      return { text: `Pressed key "${value ?? "Enter"}"`, recovered: false };
    }

    case "waitFor": {
      const numeric = value ? Number(value) : NaN;
      if (!Number.isNaN(numeric)) {
        await callToolChecked(sessionKey, "browser_wait_for", { time: numeric });
      } else {
        await callToolChecked(sessionKey, "browser_wait_for", { text: value ?? "" });
      }
      return { text: `Waited for ${value ?? "timeout"}`, recovered: false };
    }

    case "assertVisible": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      return { text: `Verified visible: ${el.description}`, recovered: resolved.recovered, resolved };
    }

    case "assertText": {
      const expected = value ?? "";
      let lastText = "";
      const deadline = Date.now() + ASSERTION_POLL_TIMEOUT_MS;
      do {
        lastText = await safeSnapshotText(sessionKey);
        if (lastText.toLowerCase().includes(expected.toLowerCase())) {
          return { text: `Verified page contains text "${expected}"`, recovered: false };
        }
        await sleep(ASSERTION_POLL_INTERVAL_MS);
      } while (Date.now() < deadline);
      throw new Error(`Expected page to contain text "${expected}" but it was not found.`);
    }

    case "assertUrl": {
      const expected = value ?? "";
      let currentUrl: string | null = null;
      const deadline = Date.now() + ASSERTION_POLL_TIMEOUT_MS;
      do {
        const text = await safeSnapshotText(sessionKey);
        currentUrl = extractUrlFromSnapshot(text);
        if (currentUrl && currentUrl.includes(expected)) {
          return { text: `Verified URL contains "${expected}"`, recovered: false };
        }
        await sleep(ASSERTION_POLL_INTERVAL_MS);
      } while (Date.now() < deadline);
      throw new Error(`Expected URL to contain "${expected}" but current URL is "${currentUrl ?? "unknown"}".`);
    }

    case "screenshot": {
      // Screenshots are captured for every step already; this action just
      // marks an explicit checkpoint the user asked for.
      return { text: "Captured screenshot", recovered: false };
    }

    case "assertEnabled":
    case "assertDisabled": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      const raw = await evaluateOnElement(
        sessionKey,
        el.description,
        resolved.ref,
        "(element) => String(!!(element.disabled || element.getAttribute('aria-disabled') === 'true'))",
      );
      const isDisabled = raw.trim().toLowerCase().includes("true");
      const expectDisabled = step.action === "assertDisabled";
      if (isDisabled !== expectDisabled) {
        throw new Error(
          `Expected ${el.description} to be ${expectDisabled ? "disabled" : "enabled"}, but it was ${isDisabled ? "disabled" : "enabled"}.`,
        );
      }
      return {
        text: `Verified ${el.description} is ${expectDisabled ? "disabled" : "enabled"}`,
        recovered: resolved.recovered,
        resolved,
      };
    }

    case "assertTableContains": {
      const el = await requireSelector(selector, step);
      const expected = value ?? "";
      const deadline = Date.now() + ASSERTION_POLL_TIMEOUT_MS;
      let lastText = "";
      let lastResolved: ResolvedElement | undefined;
      do {
        lastResolved = await resolveElement(sessionKey, el, projectId, candidates);
        lastText = await evaluateOnElement(
          sessionKey,
          el.description,
          lastResolved.ref,
          "(element) => element.innerText || element.textContent || ''",
        );
        if (lastText.toLowerCase().includes(expected.toLowerCase())) {
          return {
            text: `Verified ${el.description} contains "${expected}"`,
            recovered: lastResolved.recovered,
            resolved: lastResolved,
          };
        }
        await sleep(ASSERTION_POLL_INTERVAL_MS);
      } while (Date.now() < deadline);
      throw new Error(
        `Expected ${el.description} to contain "${expected}" but found: "${lastText.slice(0, 200)}"`,
      );
    }

    case "assertApiResponse": {
      let criteria: { urlPattern: string; expectedStatus: number };
      try {
        const parsed = JSON.parse(value ?? "");
        if (typeof parsed.urlPattern !== "string" || typeof parsed.expectedStatus !== "number") {
          throw new Error("missing urlPattern/expectedStatus");
        }
        criteria = parsed;
      } catch {
        throw new Error(
          `assertApiResponse requires a value like {"urlPattern": "/api/login", "expectedStatus": 200} but got: ${value ?? "(empty)"}`,
        );
      }
      const result = await mcpManager.callTool(sessionKey, "browser_network_requests", {});
      if (result.isError) {
        throw new Error(mcpResultToText(result) || "browser_network_requests reported an error.");
      }
      const text = mcpResultToText(result);
      const matchingLines = text.split("\n").filter((line) => line.includes(criteria.urlPattern));
      if (matchingLines.length === 0) {
        throw new Error(
          `No network request matching "${criteria.urlPattern}" was found. This may mean the request hasn't happened yet, or that browser_network_requests' output format has changed -- captured requests:\n${text.slice(0, 1000)}`,
        );
      }
      const matchedStatus = matchingLines.some((line) => {
        const statusMatch = line.match(/\b([1-5]\d{2})\b/);
        return statusMatch !== null && Number(statusMatch[1]) === criteria.expectedStatus;
      });
      if (!matchedStatus) {
        throw new Error(
          `Found request(s) matching "${criteria.urlPattern}" but none had status ${criteria.expectedStatus}:\n${matchingLines.join("\n")}`,
        );
      }
      return {
        text: `Verified request matching "${criteria.urlPattern}" returned status ${criteria.expectedStatus}`,
        recovered: false,
      };
    }

    case "assertFormValid": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      const raw = await evaluateOnElement(
        sessionKey,
        el.description,
        resolved.ref,
        "(element) => JSON.stringify({ valid: typeof element.checkValidity === 'function' ? element.checkValidity() : true, message: element.validationMessage || '' })",
      );
      let parsed: { valid: boolean; message: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Could not read validity state for ${el.description}: ${raw}`);
      }
      const [expectedRaw, ...rest] = (value ?? "valid").split(":");
      const expectedValid = expectedRaw.trim().toLowerCase() !== "invalid";
      const expectedSubstring = rest.join(":").trim();
      if (parsed.valid !== expectedValid) {
        throw new Error(
          `Expected ${el.description} to be ${expectedValid ? "valid" : "invalid"}, but checkValidity() returned ${parsed.valid} (message: "${parsed.message}").`,
        );
      }
      if (expectedSubstring && !parsed.message.toLowerCase().includes(expectedSubstring.toLowerCase())) {
        throw new Error(
          `Expected validation message to contain "${expectedSubstring}" but got "${parsed.message}".`,
        );
      }
      return {
        text: `Verified form validity of ${el.description}: ${expectedValid ? "valid" : "invalid"}`,
        recovered: resolved.recovered,
        resolved,
      };
    }

    case "assertAccessible": {
      const el = await requireSelector(selector, step);
      const resolved = await resolveElement(sessionKey, el, projectId, candidates);
      const raw = await evaluateOnElement(sessionKey, el.description, resolved.ref, ACCESSIBLE_NAME_CHECK_FN);
      const hasAccessibleName = raw.trim().toLowerCase().includes("true");
      if (!hasAccessibleName) {
        throw new Error(
          `${el.description} does not have an accessible name (missing alt text, label, or aria-label). ` +
            `Note: this is a lightweight heuristic, not a full accessibility audit.`,
        );
      }
      return {
        text: `Verified ${el.description} has an accessible name`,
        recovered: resolved.recovered,
        resolved,
      };
    }

    case "assertVisualMatch": {
      const screenshotResult = await mcpManager.callTool(sessionKey, "browser_take_screenshot", { type: "png" });
      if (screenshotResult.isError) {
        throw new Error(mcpResultToText(screenshotResult) || "Failed to capture a screenshot for the visual check.");
      }
      const imageBlock = screenshotResult.content.find((b) => b.type === "image" && b.data);
      if (!imageBlock?.data) {
        throw new Error("browser_take_screenshot returned no image data for the visual check.");
      }
      const thresholdOverride = value ? Number(value) : undefined;
      const outcome = await checkVisualMatch(
        step.id,
        testRunResultId,
        Buffer.from(imageBlock.data, "base64"),
        thresholdOverride !== undefined && !Number.isNaN(thresholdOverride) ? thresholdOverride : undefined,
      );
      if (outcome.status === "failed") {
        throw new Error(outcome.note);
      }
      return { text: outcome.note, recovered: false };
    }

    default:
      throw new Error(`Unknown step action: ${step.action}`);
  }
}

async function requireSelector(
  selector: ElementSelector | null,
  step: { description: string },
): Promise<ElementSelector> {
  if (!selector) {
    throw new Error(`Step "${step.description}" requires a selector but none was recorded.`);
  }
  return selector;
}
