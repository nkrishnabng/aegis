import type { TestRunRecord } from "@testingmcp/shared";
import { env } from "../env";
import { logger } from "../utils/logger";

/** POSTs a JSON payload to WEBHOOK_URL when a run finishes with a non-passed
 * status. A top-level "text" field makes this directly usable as a Slack
 * incoming webhook (Slack ignores the other fields); any other receiver gets
 * the structured fields instead. No-ops (no request at all) when WEBHOOK_URL
 * isn't configured. Best-effort: a delivery failure is logged, never thrown
 * -- this must never fail the run it's reporting on. */
export async function sendRunFailureWebhook(run: TestRunRecord, testCaseTitle: string): Promise<void> {
  if (!env.webhookUrl) return;

  const failedResult = run.results.find((r) => r.status === "failed" || r.status === "error");
  const shortId = run.id.slice(-8);
  const text = failedResult
    ? `❌ Test run failed: "${testCaseTitle}" (run ${shortId}) — step ${failedResult.stepOrder}: ${failedResult.errorMessage ?? "no error message"}`
    : `❌ Test run ${run.status}: "${testCaseTitle}" (run ${shortId})`;

  const payload = {
    text,
    testRunId: run.id,
    testCaseTitle,
    status: run.status,
    failedStepOrder: failedResult?.stepOrder ?? null,
    errorMessage: failedResult?.errorMessage ?? null,
  };

  try {
    const res = await fetch(env.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn(`webhookNotifier: webhook POST returned ${res.status}`);
    }
  } catch (err) {
    logger.warn(`webhookNotifier: failed to deliver webhook: ${(err as Error).message}`);
  }
}
