import { prisma } from "../db/client";
import { mcpManager } from "../mcp/mcpManager";
import { mcpResultToText } from "../mcp/toolConversion";
import { logger } from "../utils/logger";

/** Captures browser console messages and network requests via the two
 * Playwright MCP tools confirmed to exist on this server (`browser_console_messages`,
 * `browser_network_requests`) and stores them as ExecutionLog rows tagged by
 * category, so the run dashboard can show them in dedicated tabs. Best-effort:
 * a capture failure (e.g. session already closed) never fails the run. */
export async function captureDiagnostics(sessionKey: string, testRunId: string): Promise<void> {
  await Promise.all([
    captureOne(sessionKey, testRunId, "browser_console_messages", "console"),
    captureOne(sessionKey, testRunId, "browser_network_requests", "network"),
  ]);
}

async function captureOne(
  sessionKey: string,
  testRunId: string,
  toolName: string,
  category: "console" | "network",
): Promise<void> {
  try {
    const result = await mcpManager.callTool(sessionKey, toolName, {});
    const text = mcpResultToText(result);
    if (!text.trim()) return;
    await prisma.executionLog.create({
      data: { testRunId, level: "info", category, message: text.slice(0, 20000) },
    });
  } catch (err) {
    logger.warn(`diagnostics: failed to capture ${category} logs: ${(err as Error).message}`);
  }
}
