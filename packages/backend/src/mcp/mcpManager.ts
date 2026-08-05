import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { env } from "../env";
import { logger } from "../utils/logger";

// Tool result content blocks as returned by an MCP `tools/call` -- mirrors
// the shape Anthropic's `tool_result` content expects closely enough that we
// pass it straight through (see agent/agentService.ts).
export interface McpContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // close an unused browser session after 10 minutes

// The MCP SDK's default per-request timeout (60s) can be too tight for the
// first tool call on a freshly spawned session -- launching a real browser
// process (esp. a cold Chromium launch on Windows) can itself take a while,
// on top of whatever the tool call (e.g. browser_navigate) needs.
const TOOL_CALL_TIMEOUT_MS = 120 * 1000;

interface Session {
  client: Client;
  transport: StdioClientTransport;
  lastUsedAt: number;
  idleTimer: NodeJS.Timeout;
  outputDir: string;
}

// A session key (e.g. "run:<cuid>") isn't always a safe path segment --
// replace anything but alphanumerics/-/_ so it works as a directory name on
// Windows too (":" is invalid there).
function sanitizeKeyForPath(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** The chat-exploration MCP session key for one user's chat on one project
 * -- keyed per user (not just per project) so two people chatting on the
 * same project each get their own real, isolated browser, and never see
 * each other's live page navigation. Exported so executor.ts's "continue
 * from chat session" feature can look up the *triggering user's own*
 * session, not just any session for the project. */
export function chatSessionKey(projectId: string, userId: string): string {
  return `chat:${projectId}:${userId}`;
}

export interface SessionConfig {
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * Owns one Playwright MCP child-process session per key (a project id for
 * live chat-driven exploration, or a test-run id for execution). Each
 * session is a real, isolated browser context -- keeping them keyed rather
 * than global lets concurrent projects/runs proceed without cross-talk.
 */
class McpSessionManager {
  private sessions = new Map<string, Session>();

  /** True if a session is already live for this key -- used to avoid
   * lazily spinning up a browser (e.g. a chat session for a project that's
   * never been chatted with) just to check whether there's state to seed
   * a run with. */
  hasSession(key: string): boolean {
    return this.sessions.has(key);
  }

  async getSession(key: string, config?: SessionConfig): Promise<Client> {
    const existing = this.sessions.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      this.resetIdleTimer(key, existing);
      return existing.client;
    }
    return this.createSession(key, config);
  }

  /** Deterministic, independent of whether a session is currently live --
   * callers can compute this before/without starting one (e.g. to seed a
   * fresh session's storage state file before its first tool call). */
  getOutputDir(key: string): string {
    return path.join(env.artifactsDir, sanitizeKeyForPath(key));
  }

  private async createSession(key: string, config?: SessionConfig): Promise<Client> {
    logger.info(`mcp: starting Playwright MCP session for "${key}"`);

    const browser = config?.browser ?? env.playwrightBrowser;
    const headless = config?.headless ?? env.playwrightHeadless;
    const outputDir = this.getOutputDir(key);
    fs.mkdirSync(outputDir, { recursive: true });
    const args = [
      "@playwright/mcp",
      "--browser",
      browser,
      "--output-dir",
      outputDir,
      // "devtools" enables trace/video recording tools; "storage" enables
      // browser_storage_state/browser_set_storage_state (used for opt-in
      // "continue from chat session" and "rerun from step N" state restore).
      "--caps",
      "devtools,storage",
    ];
    if (headless) {
      args.push("--headless");
    }
    if (config?.viewportWidth && config?.viewportHeight) {
      args.push("--viewport-size", `${config.viewportWidth}x${config.viewportHeight}`);
    }
    args.push("--isolated");

    const transport = new StdioClientTransport({
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args,
    });

    const client = new Client({
      name: "ai-test-automation-agent",
      version: "0.1.0",
    });

    await client.connect(transport);

    const session: Session = {
      client,
      transport,
      lastUsedAt: Date.now(),
      idleTimer: setTimeout(() => this.closeSession(key), IDLE_TIMEOUT_MS),
      outputDir,
    };
    this.sessions.set(key, session);
    return client;
  }

  private resetIdleTimer(key: string, session: Session) {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => this.closeSession(key), IDLE_TIMEOUT_MS);
  }

  async listTools(key: string): Promise<McpToolDefinition[]> {
    const client = await this.getSession(key);
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(
    key: string,
    name: string,
    args: Record<string, unknown>,
    config?: SessionConfig,
  ): Promise<McpToolResult> {
    const client = await this.getSession(key, config);
    const result = await client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: TOOL_CALL_TIMEOUT_MS },
    );
    return result as unknown as McpToolResult;
  }

  async closeSession(key: string): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;
    this.sessions.delete(key);
    clearTimeout(session.idleTimer);
    try {
      await session.client.close();
    } catch (err) {
      logger.warn(`mcp: error closing session "${key}": ${(err as Error).message}`);
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((key) => this.closeSession(key)));
  }
}

export const mcpManager = new McpSessionManager();

// Shutdown (SIGINT/SIGTERM) is handled centrally in index.ts, which also
// needs to close the HTTP server -- registering separate process-level
// handlers here would race with it.
