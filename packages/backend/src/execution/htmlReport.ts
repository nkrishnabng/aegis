import type { BatchRunSummary } from "./junitReport";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_COLOR: Record<string, string> = {
  passed: "#22c55e",
  failed: "#ef4444",
  error: "#ef4444",
  skipped: "#94a3b8",
  running: "#4f8cff",
  pending: "#94a3b8",
};

/** Single self-contained HTML string (inline styles, no external JS/CSS) --
 * a downloadable CI artifact, distinct from the interactive dashboard at
 * packages/frontend/app/project/[id]/reports/page.tsx, which stays
 * untouched by this feature. */
export function buildHtmlReport(batchId: string, runs: BatchRunSummary[]): string {
  const passed = runs.filter((r) => r.status === "passed").length;
  const failed = runs.filter((r) => r.status === "failed" || r.status === "error").length;
  const skipped = runs.filter((r) => r.status === "skipped").length;
  const generatedAt = new Date().toISOString();

  const rows = runs
    .map((run) => {
      const color = STATUS_COLOR[run.status] ?? "#94a3b8";
      return `      <tr>
        <td>${escapeHtml(run.testCaseTitle)}</td>
        <td style="color:${color};font-weight:600;">${escapeHtml(run.status)}</td>
        <td>${(run.durationMs / 1000).toFixed(2)}s</td>
        <td>${escapeHtml(run.startedAt)}</td>
        <td>${escapeHtml(run.finishedAt ?? "-")}</td>
        <td>${run.errorMessage ? escapeHtml(run.errorMessage.slice(0, 300)) : "-"}</td>
      </tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>AegisQA CI report -- ${escapeHtml(batchId)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #0b1020; color: #f8fafc; margin: 0; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #94a3b8; font-size: 13px; margin-bottom: 20px; }
  .counts { display: flex; gap: 16px; margin-bottom: 24px; }
  .count { background: #172033; border: 1px solid #263248; border-radius: 10px; padding: 12px 18px; }
  .count .n { font-size: 22px; font-weight: 700; }
  .count .l { font-size: 12px; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #263248; }
  th { color: #94a3b8; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
</style>
</head>
<body>
  <h1>AegisQA CI report</h1>
  <div class="meta">Batch <code>${escapeHtml(batchId)}</code> &middot; generated ${escapeHtml(generatedAt)}</div>
  <div class="counts">
    <div class="count"><div class="n">${runs.length}</div><div class="l">Total</div></div>
    <div class="count"><div class="n" style="color:#22c55e;">${passed}</div><div class="l">Passed</div></div>
    <div class="count"><div class="n" style="color:#ef4444;">${failed}</div><div class="l">Failed</div></div>
    <div class="count"><div class="n" style="color:#94a3b8;">${skipped}</div><div class="l">Skipped</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Test case</th><th>Status</th><th>Duration</th><th>Started</th><th>Finished</th><th>Error</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>
`;
}
