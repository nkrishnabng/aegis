import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { APIUserAbortError } from "@anthropic-ai/sdk";
import type { AgentTurnStage, ServerToClientMessage } from "@testingmcp/shared";
import { anthropic, MODEL } from "./anthropicClient";
import { buildSystemPrompt } from "./systemPrompt";
import { customTools, CUSTOM_TOOL_NAMES } from "./customTools";
import {
  proposeTestCasesInputSchema,
  updateTestCaseInputSchema,
} from "./customToolSchemas";
import type { TestStepInput } from "@testingmcp/shared";
import { TEST_STEP_ACTIONS } from "@testingmcp/shared";
import { chatSessionKey, mcpManager } from "../mcp/mcpManager";
import {
  mcpResultToText,
  mcpResultToToolResultContent,
  mcpToolsToAnthropicTools,
} from "../mcp/toolConversion";
import { prisma } from "../db/client";
import { appendChatMessage, listChatMessages, toAnthropicHistory } from "../db/chatRepo";
import { applyTestCaseUpdate, createProposedTestCases } from "../db/testCaseRepo";
import { recordActivity } from "../db/agentActivityRepo";
import { getUsageTotals, recordUsage } from "../db/usageRepo";
import { getEnvironmentForExecution } from "../db/environmentRepo";
import { logger } from "../utils/logger";

const MAX_AGENT_ITERATIONS = 20;

export type Emit = (event: ServerToClientMessage) => void;

// One entry per in-flight chat turn, keyed by turnId -- lets `cancelChatTurn`
// (wired to the `chat.cancel` WS message) abort whichever Anthropic stream
// is currently in flight for that turn. Re-set on every iteration of the
// tool-use loop below (a turn can make several model calls) and removed the
// moment the turn ends, however it ends.
const activeStreams = new Map<string, ReturnType<typeof anthropic.messages.stream>>();
// Belt-and-braces alongside activeStreams: a cancel click can land between
// iterations of the loop below (after one model call finished, before the
// next one starts), when there's momentarily no live stream to abort(). This
// set makes that cancellation stick anyway -- the loop checks it before
// starting each new model call. Only the model-thinking portion of a turn is
// abortable this way; a browser-automation tool call already in flight when
// cancel is clicked will still finish before the turn notices it was cancelled.
const cancelRequested = new Set<string>();

/** Marks a turn cancelled, and aborts its in-flight model call if one is
 * happening right now (if not, the loop below picks up the cancellation the
 * next time it checks). The return value is purely informational -- true if
 * there was a live stream to abort immediately, false otherwise; the caller
 * (the WS handler) doesn't treat false as an error, since a cancel clicked
 * between model calls is completely normal. */
export function cancelChatTurn(turnId: string): boolean {
  cancelRequested.add(turnId);
  const stream = activeStreams.get(turnId);
  if (!stream) return false;
  stream.abort();
  return true;
}

/** Persists + broadcasts one activity-timeline entry. Every stage the agent
 * moves through during a turn goes through here so a page refresh can
 * reconstruct exactly what a live client just saw. */
async function activity(
  emit: Emit,
  projectId: string,
  userId: string,
  turnId: string,
  stage: AgentTurnStage,
  label: string,
  opts: { detail?: string | null; toolName?: string | null } = {},
): Promise<void> {
  const event = await recordActivity({ projectId, userId, turnId, stage, label, ...opts });
  emit({ type: "agent.activity", event });
}

// The system prompt and tool schemas are byte-identical on every iteration of
// the agent loop below (up to MAX_AGENT_ITERATIONS calls per turn) and across
// turns in the same project. Marking cache breakpoints on them lets Anthropic
// serve those tokens from cache instead of billing them at full price each time.
const CACHE_CONTROL: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

/** Runs one full chat turn: user message in, agent loop (with MCP + custom tool
 * calls) until it produces a final text reply, streamed back via `emit`.
 * Emits + persists an AgentActivityEvent at every real stage transition
 * (see AGENT_TURN_STAGES in packages/shared) so the UI can show an honest,
 * refresh-proof timeline instead of a single overwritten status string. */
export async function runChatTurnStreaming(
  projectId: string,
  urlId: string | null,
  targetUrl: string,
  userText: string,
  userId: string,
  emit: Emit,
  environmentId?: string,
): Promise<void> {
  const turnId = randomUUID();
  // Every user gets their own real, isolated Playwright session for chat
  // exploration -- keyed by user as well as project, not just project. Two
  // people chatting on the same project never share a browser tab, and
  // never see each other's live navigation, exactly like their message
  // history is already isolated below.
  const sessionKey = chatSessionKey(projectId, userId);

  const userMessage = await appendChatMessage(projectId, userId, "user", userText);
  emit({ type: "chat.message", message: userMessage });
  await activity(emit, projectId, userId, turnId, "queued", "Prompt received");

  const history = await listChatMessages(projectId, userId);
  const messages: Anthropic.MessageParam[] = toAnthropicHistory(history);
  markLastMessageCacheable(messages);

  if (environmentId) {
    const environment = await getEnvironmentForExecution(environmentId);
    if (environment) {
      await mcpManager.getSession(sessionKey, {
        browser: environment.browser,
        headless: environment.headless,
        viewportWidth: environment.viewportWidth,
        viewportHeight: environment.viewportHeight,
      });
    }
  }

  let mcpTools: Anthropic.Tool[] = [];
  try {
    mcpTools = mcpToolsToAnthropicTools(await mcpManager.listTools(sessionKey));
  } catch (err) {
    logger.error("agent: failed to list MCP tools", err);
    const message =
      "Could not start the browser automation session (Playwright MCP). " +
      "Is `npx @playwright/mcp` reachable, and have you run `npx playwright install`?";
    await activity(emit, projectId, userId, turnId, "failed", "Couldn't start the browser session", { detail: message });
    emit({ type: "error", message });
    return;
  }
  const tools: Anthropic.Tool[] = [...mcpTools, ...customTools];
  if (tools.length > 0) {
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: CACHE_CONTROL };
  }

  const system: Array<Anthropic.TextBlockParam> = [
    { type: "text", text: buildSystemPrompt(targetUrl), cache_control: CACHE_CONTROL },
  ];

  let assistantText = "";
  let usedAnyTool = false;
  let producedTestCases = false;

  try {
    await activity(emit, projectId, userId, turnId, "understanding", "Understanding the test objective");

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
      if (cancelRequested.has(turnId)) {
        await activity(emit, projectId, userId, turnId, "cancelled", "Cancelled");
        return;
      }

      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 8192,
        system,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        tools,
        messages,
      });
      activeStreams.set(turnId, stream);

      stream.on("text", (delta) => {
        assistantText += delta;
        emit({ type: "chat.delta", text: delta, turnId });
      });

      const finalMessage = await stream.finalMessage();
      messages.push({ role: "assistant", content: finalMessage.content });

      const usage = finalMessage.usage;
      const usageRecord = await recordUsage(projectId, "chat", MODEL, {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      });
      const totals = await getUsageTotals(projectId);
      emit({ type: "usage.update", usage: usageRecord, totals });

      if (finalMessage.stop_reason !== "tool_use") {
        break;
      }

      const toolUseBlocks = finalMessage.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        usedAnyTool = true;

        if (CUSTOM_TOOL_NAMES.has(block.name)) {
          await activity(
            emit,
            projectId,
            userId,
            turnId,
            "generating_test_cases",
            block.name === "propose_test_cases" ? "Generating test scenarios" : "Updating the test case",
            { toolName: block.name },
          );
          const result = await handleCustomTool(
            block.name,
            block.input,
            projectId,
            urlId,
            emit,
            userId,
            userText,
          );
          if (block.name === "propose_test_cases" && !result.isError) producedTestCases = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result.text,
            is_error: result.isError,
          });
          continue;
        }

        try {
          await activity(emit, projectId, userId, turnId, "analyzing", describeMcpTool(block.name), {
            toolName: block.name,
          });
          const mcpResult = await mcpManager.callTool(
            sessionKey,
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: mcpResultToToolResultContent(mcpResult),
            is_error: mcpResult.isError ?? false,
          });
        } catch (err) {
          logger.error(`agent: MCP tool "${block.name}" failed`, err);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool execution failed: ${(err as Error).message}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    const trimmed = assistantText.trim();
    if (trimmed.length > 0) {
      const saved = await appendChatMessage(projectId, userId, "assistant", trimmed);
      emit({ type: "chat.message", message: saved });
    }

    // Honest completion state: if the agent never called a single tool this
    // turn, it just replied conversationally (most often a clarifying
    // question) rather than doing any work -- that's "waiting for you to
    // reply", not "done". Otherwise it did real work; call out specifically
    // when that work produced test cases.
    if (!usedAnyTool) {
      await activity(emit, projectId, userId, turnId, "waiting_for_user", "Waiting for your input");
    } else {
      await activity(
        emit,
        projectId,
        userId,
        turnId,
        "completed",
        producedTestCases ? "Test cases ready" : "Done",
      );
    }
  } catch (err) {
    if (err instanceof APIUserAbortError) {
      await activity(emit, projectId, userId, turnId, "cancelled", "Cancelled");
      return;
    }
    logger.error("agent: chat turn failed", err);
    const message = `Agent error: ${(err as Error).message}`;
    await activity(emit, projectId, userId, turnId, "failed", "Agent error", { detail: message });
    emit({ type: "error", message });
  } finally {
    activeStreams.delete(turnId);
    cancelRequested.delete(turnId);
  }
}

async function handleCustomTool(
  name: string,
  rawInput: unknown,
  projectId: string,
  urlId: string | null,
  emit: Emit,
  userId: string,
  sourcePrompt: string,
): Promise<{ text: string; isError: boolean }> {
  try {
    if (name === "propose_test_cases") {
      const input = proposeTestCasesInputSchema.parse(rawInput);
      const created = await createProposedTestCases(projectId, urlId, input, userId, sourcePrompt);
      emit({ type: "testcases.proposed", testCases: created });
      return {
        text: `Saved ${created.length} test case(s): ${created.map((c) => c.title).join(", ")}.`,
        isError: false,
      };
    }
    if (name === "update_test_case") {
      const input = updateTestCaseInputSchema.parse(rawInput);
      const existing = await prisma.testCase.findUnique({ where: { id: input.testCaseId } });
      if (existing?.createdById && existing.createdById !== userId) {
        const owner = await prisma.user.findUnique({ where: { id: existing.createdById } });
        return {
          text:
            `Can't edit this test case: it's owned by ${owner?.username ?? "another user"}. ` +
            `Use the "request changes" option on the test case instead of editing it directly.`,
          isError: true,
        };
      }
      const updated = await applyTestCaseUpdate(projectId, input, userId);
      if (!updated) {
        return { text: `No test case found with id ${input.testCaseId}.`, isError: true };
      }
      emit({ type: "testcases.updated", testCase: updated });
      return { text: `Updated test case "${updated.title}": ${input.summary}`, isError: false };
    }
    return { text: `Unknown tool ${name}`, isError: true };
  } catch (err) {
    logger.error(`agent: custom tool "${name}" failed`, err);
    return { text: `Failed to apply ${name}: ${(err as Error).message}`, isError: true };
  }
}

/** Marks the last message of the already-loaded chat history as a cache
 * breakpoint, so the (potentially long) prior conversation is billed at the
 * cached rate on every iteration of this turn's agent loop, and on the next
 * turn too (as long as the history up to this point is unchanged). */
function markLastMessageCacheable(messages: Anthropic.MessageParam[]): void {
  if (messages.length === 0) return;
  const last = messages[messages.length - 1];
  if (typeof last.content !== "string") return;
  messages[messages.length - 1] = {
    role: last.role,
    content: [{ type: "text", text: last.content, cache_control: CACHE_CONTROL }],
  };
}

function describeMcpTool(name: string): string {
  if (name.includes("navigate")) return "Navigating the browser...";
  if (name.includes("snapshot")) return "Inspecting the page...";
  if (name.includes("screenshot")) return "Taking a screenshot...";
  if (name.includes("click")) return "Clicking an element...";
  if (name.includes("type") || name.includes("fill")) return "Typing into a field...";
  return `Running ${name}...`;
}

// ---------------------------------------------------------------------------
// One-shot structured calls (not part of the tool-use loop): failure
// explanation and selector recovery.
// ---------------------------------------------------------------------------

export interface FailureExplanation {
  explanation: string;
  suggestedFix: string;
}

export async function explainFailure(params: {
  projectId: string;
  stepDescription: string;
  action: string;
  errorMessage: string;
  pageSnapshot: string;
}): Promise<FailureExplanation> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description: "Plain-language explanation of why this step likely failed.",
            },
            suggestedFix: {
              type: "string",
              description:
                "Concrete, actionable suggestion to fix the test step or the app (e.g. updated selector, timing fix).",
            },
          },
          required: ["explanation", "suggestedFix"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content:
          `A Playwright test step failed. Explain why and suggest a fix.\n\n` +
          `Step: ${params.stepDescription}\n` +
          `Action: ${params.action}\n` +
          `Error: ${params.errorMessage}\n\n` +
          `Current page accessibility snapshot:\n${params.pageSnapshot.slice(0, 6000)}`,
      },
    ],
  });

  await recordUsage(params.projectId, "failure_explanation", MODEL, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    return JSON.parse(text) as FailureExplanation;
  } catch {
    return {
      explanation: text,
      suggestedFix: "Review the step manually -- could not parse a structured suggestion.",
    };
  }
}

export interface SelectorRecoveryResult {
  ref: string | null;
  confidence: "high" | "low";
  note: string;
  matchedRole: string | null;
  matchedName: string | null;
}

export async function recoverSelectorRef(params: {
  projectId: string;
  descriptor: { role?: string; name?: string; description: string };
  pageSnapshot: string;
}): Promise<SelectorRecoveryResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            ref: {
              type: ["string", "null"],
              description: "The [ref=...] id of the best-matching element, or null if none match.",
            },
            confidence: { type: "string", enum: ["high", "low"] },
            note: { type: "string", description: "One sentence explaining the match or why none was found." },
            matchedRole: {
              type: ["string", "null"],
              description: "The ARIA role of the matched element (e.g. 'button'), or null if none matched.",
            },
            matchedName: {
              type: ["string", "null"],
              description: "The accessible name/text of the matched element, or null if none matched.",
            },
          },
          required: ["ref", "confidence", "note", "matchedRole", "matchedName"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content:
          `An automated test is looking for this element on the page: role="${params.descriptor.role ?? "unknown"}", ` +
          `name="${params.descriptor.name ?? "unknown"}", description="${params.descriptor.description}".\n` +
          `The exact original selector no longer matches (the page likely changed slightly). ` +
          `Find the closest matching element in the accessibility snapshot below and return its ref id.\n\n` +
          params.pageSnapshot.slice(0, 8000),
      },
    ],
  });

  await recordUsage(params.projectId, "selector_recovery", MODEL, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    return JSON.parse(text) as SelectorRecoveryResult;
  } catch {
    return {
      ref: null,
      confidence: "low",
      note: "Could not parse recovery response.",
      matchedRole: null,
      matchedName: null,
    };
  }
}

const GENERATED_STEP_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [...TEST_STEP_ACTIONS],
    },
    selector: {
      type: ["object", "null"],
      properties: {
        strategy: {
          type: "string",
          enum: ["role", "label", "text", "placeholder", "altText", "testId", "css", "xpath"],
        },
        role: { type: ["string", "null"] },
        name: { type: ["string", "null"] },
        label: { type: ["string", "null"] },
        placeholder: { type: ["string", "null"] },
        altText: { type: ["string", "null"] },
        testId: { type: ["string", "null"] },
        css: { type: ["string", "null"] },
        xpath: { type: ["string", "null"] },
        description: { type: "string" },
      },
      required: [
        "strategy",
        "role",
        "name",
        "label",
        "placeholder",
        "altText",
        "testId",
        "css",
        "xpath",
        "description",
      ],
      additionalProperties: false,
    },
    value: { type: ["string", "null"] },
    description: { type: "string" },
  },
  required: ["action", "selector", "value", "description"],
  additionalProperties: false,
} as const;

/** Translates a single typed instruction (from the low-code test-case editor's
 * "quick-add step" input) into one structured TestStepInput, grounded against
 * a real page snapshot so the selector isn't guessed. Returned for review/
 * insertion by the caller -- never auto-saved. */
export async function generateStepFromInstruction(params: {
  projectId: string;
  targetUrl: string;
  instruction: string;
}): Promise<TestStepInput> {
  const sessionKey = `stepgen:${params.projectId}:${Date.now()}`;
  let pageSnapshot = "(no snapshot available)";
  try {
    await mcpManager.callTool(sessionKey, "browser_navigate", { url: params.targetUrl });
    const snap = await mcpManager.callTool(sessionKey, "browser_snapshot", {});
    pageSnapshot = mcpResultToText(snap);
  } catch (err) {
    logger.warn(`agent: step-generation page inspection failed: ${(err as Error).message}`);
  } finally {
    await mcpManager.closeSession(sessionKey);
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: GENERATED_STEP_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `Translate this instruction into a single structured Playwright test step: "${params.instruction}"\n\n` +
          `Ground any selector in the real accessibility snapshot below -- prefer role+name, then label, ` +
          `placeholder, text, alt text, or a data-testid; only use css/xpath if nothing else applies. ` +
          `Omit \`selector\` (return null) for actions that don't target an element (navigate, waitFor, ` +
          `assertUrl, screenshot).\n\nPage snapshot:\n${pageSnapshot.slice(0, 8000)}`,
      },
    ],
  });

  await recordUsage(params.projectId, "step_generation", MODEL, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as Omit<TestStepInput, "order">;
  return { ...parsed, order: 0 };
}
