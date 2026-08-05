import type Anthropic from "@anthropic-ai/sdk";
import type { McpToolDefinition, McpToolResult } from "./mcpManager";

/**
 * MCP `inputSchema` is already plain JSON Schema, so converting to an
 * Anthropic tool definition is a 1:1 field rename -- no schema translation
 * needed.
 */
export function mcpToolsToAnthropicTools(
  tools: McpToolDefinition[],
): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? `Playwright MCP tool: ${tool.name}`,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Converts an MCP `tools/call` result into the content array shape expected
 * inside an Anthropic `tool_result` block. Text blocks pass straight
 * through; image blocks (e.g. from browser_take_screenshot) become base64
 * image blocks so Claude can actually see the screenshot it just took.
 */
export function mcpResultToToolResultContent(
  result: McpToolResult,
): Anthropic.TextBlockParam[] | Anthropic.ImageBlockParam[] | (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] {
  const blocks: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text" && block.text) {
      blocks.push({ type: "text", text: block.text });
    } else if (block.type === "image" && block.data) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: (block.mimeType as "image/png" | "image/jpeg") || "image/png",
          data: block.data,
        },
      });
    }
  }
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "(tool returned no content)" });
  }
  return blocks;
}

/** Plain-text-only rendering of an MCP result, for logs and selector recovery. */
export function mcpResultToText(result: McpToolResult): string {
  return (result.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");
}
