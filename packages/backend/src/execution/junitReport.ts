import type { RunStatus } from "@testingmcp/shared";

/** One TestRun's worth of data needed to render a JUnit/HTML report row --
 * built by the route handler from a `TestRun.findMany({ where: { batchId } })`
 * query (see routes/testruns.ts), not derived from the wire `TestRunRecord`
 * shape (which has no denormalized test case title). */
export interface BatchRunSummary {
  id: string;
  testCaseTitle: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  errorMessage: string | null;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Hand-rolled XML string templating -- consistent with this repo's existing
 * approach in exporter.ts, no XML library dependency. Grain is one
 * `<testcase>` per TestRun (not per step), matching JUnit's natural unit.
 * `status === "error"` is mapped to `<error>` for forward-compatibility, but
 * nothing in this codebase actually produces that status today -- every
 * thrown step error is currently recorded as `"failed"`. */
export function buildJunitXml(batchId: string, runs: BatchRunSummary[]): string {
  const failures = runs.filter((r) => r.status === "failed").length;
  const errors = runs.filter((r) => r.status === "error").length;
  const skipped = runs.filter((r) => r.status === "skipped").length;
  const totalTimeSec = runs.reduce((sum, r) => sum + r.durationMs, 0) / 1000;

  const testcases = runs
    .map((run) => {
      const timeSec = (run.durationMs / 1000).toFixed(3);
      const name = escapeXml(run.testCaseTitle);
      if (run.status === "failed") {
        return (
          `  <testcase classname="${escapeXml(batchId)}" name="${name}" time="${timeSec}">\n` +
          `    <failure message="${escapeXml(run.errorMessage ?? "Test failed")}">${escapeXml(run.errorMessage ?? "")}</failure>\n` +
          `  </testcase>`
        );
      }
      if (run.status === "error") {
        return (
          `  <testcase classname="${escapeXml(batchId)}" name="${name}" time="${timeSec}">\n` +
          `    <error message="${escapeXml(run.errorMessage ?? "Test errored")}">${escapeXml(run.errorMessage ?? "")}</error>\n` +
          `  </testcase>`
        );
      }
      if (run.status === "skipped") {
        return (
          `  <testcase classname="${escapeXml(batchId)}" name="${name}" time="${timeSec}">\n` +
          `    <skipped/>\n` +
          `  </testcase>`
        );
      }
      return `  <testcase classname="${escapeXml(batchId)}" name="${name}" time="${timeSec}"/>`;
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuite name="${escapeXml(batchId)}" tests="${runs.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${totalTimeSec.toFixed(3)}">\n` +
    `${testcases}\n` +
    `</testsuite>\n`
  );
}
