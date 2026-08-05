import type Anthropic from "@anthropic-ai/sdk";
import { TEST_STEP_ACTIONS } from "@testingmcp/shared";

// Custom, client-side tools the agent can call in addition to whatever
// Playwright MCP exposes. These are intercepted entirely by the backend
// (agentService.ts) and never forwarded to the MCP browser session.

const selectorSchema = {
  type: "object",
  description:
    "Resilient element descriptor. Prefer role+name, then label, then " +
    "placeholder, then visible text, then a data-testid. Only fall back to " +
    "`css` if the element genuinely has no accessible role/name/label/text. " +
    "Omit entirely for actions that don't target an element (navigate, " +
    "waitFor, assertUrl, screenshot).",
  properties: {
    strategy: {
      type: "string",
      enum: ["role", "label", "text", "placeholder", "altText", "testId", "css", "xpath"],
    },
    role: { type: "string", description: "ARIA role, e.g. 'button', 'textbox', 'link'" },
    name: { type: "string", description: "Accessible name for the role strategy" },
    label: { type: "string" },
    placeholder: { type: "string" },
    altText: { type: "string", description: "Image/icon alt text" },
    testId: { type: "string" },
    css: { type: "string", description: "Last-resort CSS selector" },
    xpath: { type: "string", description: "Last-resort XPath, tried after css" },
    description: {
      type: "string",
      description:
        "Short human-readable description of the element, e.g. 'Email input field'. " +
        "Always required -- used to re-locate the element if the exact selector " +
        "no longer matches at execution time.",
    },
  },
  required: ["strategy", "description"],
} as const;

const stepSchema = {
  type: "object",
  properties: {
    order: { type: "integer", minimum: 1 },
    action: {
      type: "string",
      enum: [...TEST_STEP_ACTIONS],
    },
    selector: selectorSchema,
    value: {
      type: "string",
      description:
        "Text to type/select, key to press, URL to navigate to, or expected " +
        "text/URL for assertions. Omit when not applicable.",
    },
    description: {
      type: "string",
      description: "Human-readable description of this step, shown in the UI and exported script comments.",
    },
  },
  required: ["order", "action", "description"],
};

const testCaseSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    objective: { type: "string", description: "One-sentence goal of this test case." },
    preconditions: { type: "string", description: "State required before running, e.g. 'User is logged out'." },
    testData: {
      type: "object",
      description: "Key/value test data used by the steps, e.g. { username: '...', password: '...' }.",
      additionalProperties: true,
    },
    expectedResult: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
    type: {
      type: "string",
      enum: ["smoke", "regression", "functional", "negative", "ui", "accessibility", "edgeCase"],
    },
    module: {
      type: "string",
      description:
        "Short functional-area tag for this test case, e.g. 'Authentication', 'Checkout', " +
        "'Search'. Infer it from the page/feature being tested. Omit if genuinely unclear.",
    },
    steps: { type: "array", items: stepSchema },
  },
  required: [
    "title",
    "objective",
    "preconditions",
    "testData",
    "expectedResult",
    "priority",
    "type",
    "steps",
  ],
};

export const proposeTestCasesTool: Anthropic.Tool = {
  name: "propose_test_cases",
  description:
    "Save one or more generated test cases so they appear in the UI for the " +
    "user to review, edit, and run. Call this once you have inspected the " +
    "real page (via the browser tools) and are ready to hand off concrete, " +
    "resilient-selector test cases -- do not call it with guessed selectors " +
    "you have not verified against a page snapshot.",
  input_schema: {
    type: "object",
    properties: {
      testCases: { type: "array", items: testCaseSchema, minItems: 1 },
    },
    required: ["testCases"],
  },
};

export const updateTestCaseTool: Anthropic.Tool = {
  name: "update_test_case",
  description:
    "Apply an edit to an existing, already-saved test case in response to a " +
    "user's chat instruction (e.g. 'change the password test data to ...', " +
    "'add a step that checks the error message'). Only include the fields " +
    "that changed; `steps`, if included, fully replaces the step list.",
  input_schema: {
    type: "object",
    properties: {
      testCaseId: { type: "string" },
      updates: {
        type: "object",
        properties: {
          title: { type: "string" },
          objective: { type: "string" },
          preconditions: { type: "string" },
          testData: { type: "object", additionalProperties: true },
          expectedResult: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          type: {
            type: "string",
            enum: ["smoke", "regression", "functional", "negative", "ui", "accessibility", "edgeCase"],
          },
          module: { type: "string" },
          steps: { type: "array", items: stepSchema },
        },
      },
      summary: {
        type: "string",
        description: "One-sentence human-readable summary of what changed, shown in chat.",
      },
    },
    required: ["testCaseId", "updates", "summary"],
  },
};

export const customTools: Anthropic.Tool[] = [proposeTestCasesTool, updateTestCaseTool];
export const CUSTOM_TOOL_NAMES = new Set(customTools.map((t) => t.name));
