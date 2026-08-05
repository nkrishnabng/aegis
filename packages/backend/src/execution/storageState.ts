import fs from "node:fs/promises";
import path from "node:path";
import { mcpManager } from "../mcp/mcpManager";
import { mcpResultToText } from "../mcp/toolConversion";
import { logger } from "../utils/logger";
import { findNewestFile } from "./artifacts";
import { extractEvaluateResultValue } from "./evaluateUtils";

/** Best-effort: saves the session's current storage state (cookies +
 * localStorage) via `browser_storage_state` and reads it back from this
 * session's own --output-dir. Returns null on any failure -- callers treat
 * that as "nothing to inherit", never as a run failure. The parsed object is
 * Playwright's standard storageState() shape; never returned by any API
 * response (same sensitivity class as encrypted Environment credentials). */
export async function captureStorageState(sessionKey: string): Promise<Record<string, unknown> | null> {
  const outputDir = mcpManager.getOutputDir(sessionKey);
  const sinceMs = Date.now() - 60_000;
  try {
    const result = await mcpManager.callTool(sessionKey, "browser_storage_state", {});
    if (result.isError) return null;
    const file = await findNewestFile(
      outputDir,
      (name) => name.startsWith("storage-state") && name.endsWith(".json"),
      sinceMs,
    );
    if (!file) return null;
    const content = await fs.readFile(file, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    logger.warn(`storageState: capture failed for "${sessionKey}": ${(err as Error).message}`);
    return null;
  }
}

/** Restores previously-captured storage state onto a (typically fresh)
 * session, by writing it to a file inside that session's own --output-dir
 * (required so `browser_set_storage_state`'s file-access check allows it)
 * and calling the tool. Best-effort: a failure here just means the new
 * session starts from a clean/logged-out state, same as before this
 * feature existed. */
export async function restoreStorageState(
  sessionKey: string,
  state: Record<string, unknown>,
): Promise<void> {
  const outputDir = mcpManager.getOutputDir(sessionKey);
  try {
    await fs.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, "inherited-storage-state.json");
    await fs.writeFile(filePath, JSON.stringify(state));
    await mcpManager.callTool(sessionKey, "browser_set_storage_state", { filename: filePath });
  } catch (err) {
    logger.warn(`storageState: restore failed for "${sessionKey}": ${(err as Error).message}`);
  }
}

/** Best-effort current page URL via a page-level (no target/element)
 * `browser_evaluate` call. Returns null on failure. */
export async function capturePageUrl(sessionKey: string): Promise<string | null> {
  try {
    const result = await mcpManager.callTool(sessionKey, "browser_evaluate", {
      function: "() => location.href",
    });
    if (result.isError) return null;
    const url = extractEvaluateResultValue(mcpResultToText(result));
    return url || null;
  } catch (err) {
    logger.warn(`storageState: page URL capture failed for "${sessionKey}": ${(err as Error).message}`);
    return null;
  }
}
