import path from "node:path";
import { env } from "../env";
import { mcpManager } from "../mcp/mcpManager";
import { logger } from "../utils/logger";
import { findNewestFile } from "./artifacts";

/** Converts an absolute artifact path into the relative form stored on
 * TestRun and served under `/artifacts/*` (forward slashes so it's a valid
 * URL path segment on every OS). */
function toServablePath(absoluteFile: string): string {
  return path.relative(env.artifactsDir, absoluteFile).split(path.sep).join("/");
}

/** Best-effort: starts trace + video recording on a session (requires the
 * "devtools" MCP capability, enabled by mcpManager for every session). Either
 * or both can silently no-op on a server/browser combination that doesn't
 * support it -- callers should not treat a missing trace/video as a run
 * failure, only as "no artifact this time" (see the Trace tab's fallback to
 * its reconstructed timeline). */
export async function startDiagnosticsCapture(sessionKey: string): Promise<void> {
  await Promise.all([
    mcpManager.callTool(sessionKey, "browser_start_tracing", {}).catch((err) => {
      logger.warn(`traceCapture: failed to start tracing: ${(err as Error).message}`);
    }),
    mcpManager.callTool(sessionKey, "browser_start_video", {}).catch((err) => {
      logger.warn(`traceCapture: failed to start video: ${(err as Error).message}`);
    }),
  ]);
}

export interface DiagnosticsCaptureResult {
  tracePath: string | null;
  videoPath: string | null;
}

/** Stops trace/video recording and locates the resulting file(s) inside this
 * session's own --output-dir (scoped per session key, so there's no
 * ambiguity about which file belongs to this run). Best-effort throughout. */
export async function stopDiagnosticsCapture(sessionKey: string): Promise<DiagnosticsCaptureResult> {
  const outputDir = mcpManager.getOutputDir(sessionKey);
  const sinceMs = Date.now() - 5 * 60 * 1000; // generous window; this dir is single-session

  let tracePath: string | null = null;
  try {
    await mcpManager.callTool(sessionKey, "browser_stop_tracing", {});
    const file = await findNewestFile(outputDir, (name) => name.endsWith(".trace"), sinceMs);
    tracePath = file ? toServablePath(file) : null;
  } catch (err) {
    logger.warn(`traceCapture: failed to stop tracing: ${(err as Error).message}`);
  }

  let videoPath: string | null = null;
  try {
    await mcpManager.callTool(sessionKey, "browser_stop_video", {});
    const file = await findNewestFile(outputDir, (name) => name.endsWith(".webm"), sinceMs);
    videoPath = file ? toServablePath(file) : null;
  } catch (err) {
    logger.warn(`traceCapture: failed to stop video: ${(err as Error).message}`);
  }

  return { tracePath, videoPath };
}
