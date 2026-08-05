import type { TestCaseRecord, TestStepInput } from "@testingmcp/shared";
import { prisma } from "./client";
import { serializeTestCase } from "./serializers";
import type {
  ProposeTestCasesInput,
  UpdateTestCaseInput,
} from "../agent/customToolSchemas";

const include = {
  steps: true,
  createdBy: true,
  lastModifiedBy: true,
  _count: { select: { changeRequests: { where: { status: "open" } } } },
} as const;

export async function createProposedTestCases(
  projectId: string,
  urlId: string | null,
  input: ProposeTestCasesInput,
  createdById?: string,
  sourcePrompt?: string,
): Promise<TestCaseRecord[]> {
  const created: TestCaseRecord[] = [];
  for (const tc of input.testCases) {
    const record = await prisma.testCase.create({
      data: {
        projectId,
        urlId,
        createdById: createdById ?? null,
        lastModifiedById: createdById ?? null,
        sourcePrompt: sourcePrompt ?? null,
        title: tc.title,
        objective: tc.objective,
        preconditions: tc.preconditions,
        testData: JSON.stringify(tc.testData),
        expectedResult: tc.expectedResult,
        priority: tc.priority,
        type: tc.type,
        module: tc.module ?? null,
        status: "draft",
        steps: {
          create: tc.steps.map((step) => ({
            order: step.order,
            action: step.action,
            selector: step.selector ? JSON.stringify(step.selector) : null,
            locatorCandidates: step.locatorCandidates ? JSON.stringify(step.locatorCandidates) : null,
            value: step.value ?? null,
            description: step.description,
            enabled: step.enabled ?? true,
          })),
        },
      },
      include,
    });
    created.push(serializeTestCase(record));
  }
  return created;
}

export async function applyTestCaseUpdate(
  projectId: string,
  input: UpdateTestCaseInput,
  actingUserId?: string,
): Promise<TestCaseRecord | null> {
  const existing = await prisma.testCase.findFirst({
    where: { id: input.testCaseId, projectId },
  });
  if (!existing) return null;

  const { updates } = input;

  await prisma.$transaction(async (tx) => {
    await tx.testCase.update({
      where: { id: input.testCaseId },
      data: {
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.objective !== undefined ? { objective: updates.objective } : {}),
        ...(updates.preconditions !== undefined
          ? { preconditions: updates.preconditions }
          : {}),
        ...(updates.testData !== undefined
          ? { testData: JSON.stringify(updates.testData) }
          : {}),
        ...(updates.expectedResult !== undefined
          ? { expectedResult: updates.expectedResult }
          : {}),
        ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
        ...(updates.type !== undefined ? { type: updates.type } : {}),
        ...(updates.module !== undefined ? { module: updates.module } : {}),
        ...(updates.tags !== undefined ? { tags: JSON.stringify(updates.tags) } : {}),
        version: { increment: 1 },
        ...(actingUserId ? { lastModifiedById: actingUserId } : {}),
      },
    });

    if (updates.steps) {
      await tx.testStep.deleteMany({ where: { testCaseId: input.testCaseId } });
      for (const step of updates.steps) {
        await tx.testStep.create({
          data: {
            testCaseId: input.testCaseId,
            order: step.order,
            action: step.action,
            selector: step.selector ? JSON.stringify(step.selector) : null,
            locatorCandidates: step.locatorCandidates ? JSON.stringify(step.locatorCandidates) : null,
            value: step.value ?? null,
            description: step.description,
            enabled: step.enabled ?? true,
            sourceFlowVersionId: step.sourceFlowVersionId ?? null,
          },
        });
      }
    }
  });

  const updated = await prisma.testCase.findUniqueOrThrow({
    where: { id: input.testCaseId },
    include,
  });
  return serializeTestCase(updated);
}

/** Appends a Flow version's steps to the end of a test case, tagging each
 * with `sourceFlowVersionId` for provenance (see the schema comment on
 * TestStep). The steps are otherwise perfectly normal, concrete TestStep
 * rows -- the executor/exporter have no idea flows exist. */
export async function insertFlowIntoTestCase(
  testCaseId: string,
  flowVersionId: string,
): Promise<TestCaseRecord | null> {
  const testCase = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    include: { steps: true },
  });
  if (!testCase) return null;
  const flowVersion = await prisma.flowVersion.findUnique({ where: { id: flowVersionId } });
  if (!flowVersion) throw new Error("Flow version not found");

  const flowSteps = JSON.parse(flowVersion.steps) as TestStepInput[];
  const maxOrder = testCase.steps.reduce((max, s) => Math.max(max, s.order), 0);

  await prisma.testStep.createMany({
    data: flowSteps.map((step, i) => ({
      testCaseId,
      order: maxOrder + i + 1,
      action: step.action,
      selector: step.selector ? JSON.stringify(step.selector) : null,
      locatorCandidates: step.locatorCandidates ? JSON.stringify(step.locatorCandidates) : null,
      value: step.value ?? null,
      description: step.description,
      enabled: step.enabled ?? true,
      sourceFlowVersionId: flowVersionId,
    })),
  });

  const updated = await prisma.testCase.findUniqueOrThrow({ where: { id: testCaseId }, include });
  return serializeTestCase(updated);
}

/** Replaces every step in this test case tagged with `sourceFlowVersionId`
 * (the flow version it was originally inserted from) with `toFlowVersionId`'s
 * current steps, re-tagged to the new version. Never automatic -- the editor
 * only calls this after an explicit "update to latest" click, same "nothing
 * applied without a human action" pattern as HealingEvent approval. Steps
 * are inserted at the position of the first replaced step; everything else
 * keeps its relative order. */
export async function updateFlowBlockInTestCase(
  testCaseId: string,
  sourceFlowVersionId: string,
  toFlowVersionId: string,
): Promise<TestCaseRecord | null> {
  const testCase = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    include: { steps: true },
  });
  if (!testCase) return null;
  const toVersion = await prisma.flowVersion.findUnique({ where: { id: toFlowVersionId } });
  if (!toVersion) throw new Error("Target flow version not found");

  const allSteps = testCase.steps.slice().sort((a, b) => a.order - b.order);
  const matched = allSteps.filter((s) => s.sourceFlowVersionId === sourceFlowVersionId);
  if (matched.length === 0) throw new Error("No steps in this test case came from that flow version.");
  const remaining = allSteps.filter((s) => s.sourceFlowVersionId !== sourceFlowVersionId);
  const minMatchedOrder = Math.min(...matched.map((s) => s.order));
  const insertionIndex = remaining.filter((s) => s.order < minMatchedOrder).length;

  const newFlowSteps = JSON.parse(toVersion.steps) as TestStepInput[];
  const before = remaining.slice(0, insertionIndex);
  const after = remaining.slice(insertionIndex);

  await prisma.$transaction(async (tx) => {
    await tx.testStep.deleteMany({ where: { testCaseId } });
    let order = 1;
    for (const step of before) {
      await tx.testStep.create({
        data: {
          testCaseId,
          order: order++,
          action: step.action,
          selector: step.selector,
          locatorCandidates: step.locatorCandidates,
          value: step.value,
          description: step.description,
          enabled: step.enabled,
          sourceFlowVersionId: step.sourceFlowVersionId,
        },
      });
    }
    for (const step of newFlowSteps) {
      await tx.testStep.create({
        data: {
          testCaseId,
          order: order++,
          action: step.action,
          selector: step.selector ? JSON.stringify(step.selector) : null,
          locatorCandidates: step.locatorCandidates ? JSON.stringify(step.locatorCandidates) : null,
          value: step.value ?? null,
          description: step.description,
          enabled: step.enabled ?? true,
          sourceFlowVersionId: toFlowVersionId,
        },
      });
    }
    for (const step of after) {
      await tx.testStep.create({
        data: {
          testCaseId,
          order: order++,
          action: step.action,
          selector: step.selector,
          locatorCandidates: step.locatorCandidates,
          value: step.value,
          description: step.description,
          enabled: step.enabled,
          sourceFlowVersionId: step.sourceFlowVersionId,
        },
      });
    }
  });

  const updated = await prisma.testCase.findUniqueOrThrow({ where: { id: testCaseId }, include });
  return serializeTestCase(updated);
}
