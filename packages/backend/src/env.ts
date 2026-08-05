import "dotenv/config";
import path from "node:path";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  port: Number(process.env.PORT || 4000),
  playwrightHeadless: (process.env.PLAYWRIGHT_HEADLESS ?? "true") !== "false",
  playwrightBrowser: process.env.PLAYWRIGHT_BROWSER || "chromium",
  screenshotsDir: path.resolve(
    process.cwd(),
    process.env.SCREENSHOTS_DIR || "./data/screenshots",
  ),
  // Root directory Playwright MCP sessions are given as --output-dir (one
  // subdirectory per session key), holding traces/videos/storage-state files.
  artifactsDir: path.resolve(
    process.cwd(),
    process.env.ARTIFACTS_DIR || "./data/mcp-artifacts",
  ),
  // Optional: POSTed with a JSON payload (Slack-incoming-webhook-compatible,
  // via a top-level "text" field) whenever a test run finishes with a
  // non-passed status. Unset by default -- no notification is sent.
  webhookUrl: process.env.WEBHOOK_URL || "",
  // Baseline/actual/diff screenshots for assertVisualMatch steps, served at
  // /visual-regression/*.
  visualRegressionDir: path.resolve(
    process.cwd(),
    process.env.VISUAL_REGRESSION_DIR || "./data/visual-regression",
  ),
  // Default % of pixels allowed to differ before an assertVisualMatch step
  // fails and creates a pending VisualDiff; a step's own `value` can override
  // this per-step.
  visualDiffThresholdPercent: Number(process.env.VISUAL_DIFF_THRESHOLD_PERCENT || "0.1"),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY ?? "",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  maxParallelRuns: Number(process.env.MAX_PARALLEL_RUNS || 3),
};

export function assertAnthropicKeyPresent(): void {
  required("ANTHROPIC_API_KEY");
}
