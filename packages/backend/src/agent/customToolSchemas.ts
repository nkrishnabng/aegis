import { z } from "zod";
import { TEST_STEP_ACTIONS } from "@testingmcp/shared";

// Runtime validation for the (untyped) `input` payloads Claude sends back on
// propose_test_cases / update_test_case tool_use blocks. Mirrors the JSON
// Schema in customTools.ts, which is what the model actually sees.

export const selectorSchema = z.object({
  strategy: z.enum(["role", "label", "text", "placeholder", "altText", "testId", "css", "xpath"]),
  role: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  altText: z.string().optional(),
  testId: z.string().optional(),
  css: z.string().optional(),
  xpath: z.string().optional(),
  description: z.string(),
});

export const stepSchema = z.object({
  order: z.number().int().min(1),
  action: z.enum(TEST_STEP_ACTIONS),
  selector: selectorSchema.optional().nullable(),
  locatorCandidates: z.array(selectorSchema).optional().nullable(),
  value: z.string().optional().nullable(),
  description: z.string(),
  enabled: z.boolean().optional(),
  // Round-trips a step's flow provenance through a save -- see the shared
  // TestStepInput.sourceFlowVersionId doc comment. The agent never sets
  // this; only the test case editor's save (echoing back what GET returned)
  // does.
  sourceFlowVersionId: z.string().optional().nullable(),
});

const testCaseTypeSchema = z.enum([
  "smoke",
  "regression",
  "functional",
  "negative",
  "ui",
  "accessibility",
  "edgeCase",
]);

export const testCaseSchema = z.object({
  title: z.string(),
  objective: z.string(),
  preconditions: z.string(),
  testData: z.record(z.unknown()),
  expectedResult: z.string(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  type: testCaseTypeSchema,
  module: z.string().optional().nullable(),
  steps: z.array(stepSchema).min(1),
});

export const proposeTestCasesInputSchema = z.object({
  testCases: z.array(testCaseSchema).min(1),
});

export const updateTestCaseInputSchema = z.object({
  testCaseId: z.string(),
  updates: z.object({
    title: z.string().optional(),
    objective: z.string().optional(),
    preconditions: z.string().optional(),
    testData: z.record(z.unknown()).optional(),
    expectedResult: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    type: testCaseTypeSchema.optional(),
    module: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    steps: z.array(stepSchema).optional(),
  }),
  summary: z.string(),
});

export type ProposeTestCasesInput = z.infer<typeof proposeTestCasesInputSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseInputSchema>;
