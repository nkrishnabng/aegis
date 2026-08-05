import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { serializeTestCase } from "../db/serializers";
import { applyTestCaseUpdate, insertFlowIntoTestCase, updateFlowBlockInTestCase } from "../db/testCaseRepo";
import { getLatestVersionNumbers } from "../db/flowRepo";
import { getTestDataSet, upsertTestDataSet, deleteTestDataSet, updateSecretColumns } from "../db/testDataSetRepo";
import { stepSchema } from "../agent/customToolSchemas";
import { generateStepFromInstruction } from "../agent/agentService";
import { exportTestCaseAsPlaywrightScript, fileNameFor } from "../execution/exporter";
import { executeTestCase, runTestCaseAcrossDataSet } from "../execution/executor";
import { parseTestData, TestDataParseError } from "../execution/testDataParser";
import { env } from "../env";
import { broadcast } from "../ws/broadcastRegistry";
import { testCaseChangeRequestsRouter } from "./changeRequests";
import { canReviewTestCases, requireProjectRole } from "../auth/projectAccess";
import { recordAudit } from "../db/auditLogRepo";

export const testCasesRouter = Router();

const testCaseInclude = {
  steps: { include: { sourceFlowVersion: { include: { flow: true } } } },
  createdBy: true,
  lastModifiedBy: true,
  _count: { select: { changeRequests: { where: { status: "open" as const } } } },
} as const;

/** Only the creator (or an admin) may edit/delete. Legacy test cases with no
 * recorded owner (created before this feature existed) stay editable by anyone. */
function canEdit(testCase: { createdById: string | null }, user: { id: string; role: string }): boolean {
  if (!testCase.createdById) return true;
  return testCase.createdById === user.id || user.role === "admin";
}

testCasesRouter.use("/:id/change-requests", testCaseChangeRequestsRouter);

testCasesRouter.get("/:id", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({
    where: { id: req.params.id },
    include: testCaseInclude,
  });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "viewer"))) return;
  const record = serializeTestCase(testCase);

  // Attach flow provenance (which flow/version a step came from, and
  // whether that version is stale) -- computed here rather than in
  // serializeTestCase so routes that don't need it (export, etc.) don't pay
  // for an extra query.
  const flowIds = [
    ...new Set(
      testCase.steps.map((s) => s.sourceFlowVersion?.flow.id).filter((id): id is string => !!id),
    ),
  ];
  if (flowIds.length > 0) {
    const latestVersions = await getLatestVersionNumbers(flowIds);
    record.steps = record.steps.map((stepRecord) => {
      const raw = testCase.steps.find((s) => s.id === stepRecord.id);
      if (!raw?.sourceFlowVersion) return stepRecord;
      return {
        ...stepRecord,
        sourceFlow: {
          flowId: raw.sourceFlowVersion.flow.id,
          flowName: raw.sourceFlowVersion.flow.name,
          versionId: raw.sourceFlowVersion.id,
          version: raw.sourceFlowVersion.version,
          isLatest: raw.sourceFlowVersion.version === latestVersions.get(raw.sourceFlowVersion.flow.id),
        },
      };
    });
  }

  res.json(record);
});

const directUpdateSchema = z.object({
  title: z.string().optional(),
  objective: z.string().optional(),
  preconditions: z.string().optional(),
  testData: z.record(z.unknown()).optional(),
  expectedResult: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  type: z
    .enum(["smoke", "regression", "functional", "negative", "ui", "accessibility", "edgeCase"])
    .optional(),
  module: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "approved", "archived"]).optional(),
  steps: z.array(stepSchema).optional(),
});

testCasesRouter.put("/:id", async (req, res) => {
  const body = directUpdateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "editor"))) return;
  if (!canEdit(testCase, req.user!)) {
    res.status(403).json({ error: "Only the owner or an admin can edit this test case." });
    return;
  }

  // Approving is a distinct, reviewer-gated action (see POST /:id/review) --
  // an editor may freely move status between draft/archived (including
  // demoting an already-approved test back to draft) but can't be the one
  // who flips it into "approved" themselves. Sending back the current
  // "approved" value unchanged (the editor form round-trips it on every
  // save) is allowed since that's not a new approval.
  if (body.data.status === "approved" && testCase.status !== "approved") {
    res.status(400).json({
      error: 'Approving a test case requires "reviewer" or "owner" access and must go through the review action, not a direct edit.',
    });
    return;
  }

  if (body.data.status) {
    await prisma.testCase.update({ where: { id: req.params.id }, data: { status: body.data.status } });
  }

  const { status: _status, ...updates } = body.data;
  const updated = await applyTestCaseUpdate(
    testCase.projectId,
    {
      testCaseId: req.params.id,
      updates,
      summary: "Edited via the test case editor.",
    },
    req.user!.id,
  );

  if (!updated) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  broadcast(testCase.projectId, { type: "testcases.updated", testCase: updated });
  res.json(updated);
});

testCasesRouter.delete("/:id", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(204).end();
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "editor"))) return;
  if (!canEdit(testCase, req.user!)) {
    res.status(403).json({ error: "Only the owner or an admin can delete this test case." });
    return;
  }
  await prisma.testCase.delete({ where: { id: req.params.id } }).catch(() => null);
  await recordAudit({
    userId: req.user!.id,
    projectId: testCase.projectId,
    action: "testcase.deleted",
    targetType: "TestCase",
    targetId: testCase.id,
    detail: testCase.title,
  });
  res.status(204).end();
});

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().optional(),
});

// Approve/reject: the reviewer-gated counterpart to PUT /:id's status field.
// Requires "reviewer" or "owner" project access (not "editor" -- see
// canReviewTestCases) and, separately, that the requester isn't the test
// case's own author -- closes the segregation-of-duties gap where the only
// person who could otherwise flip a test to "approved" was whoever wrote it.
testCasesRouter.post("/:id/review", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  const role = await requireProjectRole(req, res, testCase.projectId, "viewer");
  if (!role) return;
  if (!canReviewTestCases(role)) {
    res.status(403).json({ error: 'This action requires "reviewer" or "owner" access to this project.' });
    return;
  }
  if (testCase.createdById === req.user!.id) {
    res.status(403).json({ error: "You can't approve or reject your own test case -- ask another reviewer or the project owner." });
    return;
  }
  const body = reviewSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const nextStatus = body.data.decision === "approve" ? "approved" : "draft";
  const updated = await prisma.testCase.update({
    where: { id: req.params.id },
    data: { status: nextStatus },
    include: testCaseInclude,
  });
  await recordAudit({
    userId: req.user!.id,
    projectId: testCase.projectId,
    action: body.data.decision === "approve" ? "testcase.approved" : "testcase.rejected",
    targetType: "TestCase",
    targetId: testCase.id,
    detail: body.data.note ?? testCase.title,
  });
  const record = serializeTestCase(updated);
  broadcast(testCase.projectId, { type: "testcases.updated", testCase: record });
  res.json(record);
});

testCasesRouter.get("/:id/export", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({
    where: { id: req.params.id },
    include: testCaseInclude,
  });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "viewer"))) return;
  const dataSet = await getTestDataSet(req.params.id);
  const script = exportTestCaseAsPlaywrightScript(serializeTestCase(testCase), dataSet);
  const fileName = fileNameFor(testCase.title);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(script);
});

const generateStepSchema = z.object({ instruction: z.string().min(1) });

testCasesRouter.post("/:id/steps/generate", async (req, res) => {
  const body = generateStepSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "instruction is required" });
    return;
  }
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id }, include: { url: true } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "editor"))) return;
  if (!testCase.url) {
    res.status(400).json({ error: "This test case has no target URL to inspect." });
    return;
  }
  try {
    const step = await generateStepFromInstruction({
      projectId: testCase.projectId,
      targetUrl: testCase.url.url,
      instruction: body.data.instruction,
    });
    res.json(step);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const runBodySchema = z.object({
  environmentId: z.string().optional(),
  continueFromChatSession: z.boolean().optional(),
});

testCasesRouter.post("/:id/run", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "viewer"))) return;
  const body = runBodySchema.safeParse(req.body ?? {});
  try {
    const run = await executeTestCase(
      req.params.id,
      "user",
      (event) => broadcast(testCase.projectId, event),
      {
        environmentId: body.success ? body.data.environmentId : undefined,
        continueFromChatSession: body.success ? body.data.continueFromChatSession : undefined,
        userId: req.user!.id,
      },
    );
    res.status(201).json(run);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const insertFlowSchema = z.object({ flowVersionId: z.string().min(1) });

testCasesRouter.post("/:id/steps/insert-flow", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "editor"))) return;
  if (!canEdit(testCase, req.user!)) {
    res.status(403).json({ error: "Only the owner or an admin can edit this test case." });
    return;
  }
  const body = insertFlowSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const updated = await insertFlowIntoTestCase(req.params.id, body.data.flowVersionId);
    broadcast(testCase.projectId, { type: "testcases.updated", testCase: updated! });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const updateFlowBlockSchema = z.object({
  sourceFlowVersionId: z.string().min(1),
  toFlowVersionId: z.string().min(1),
});

testCasesRouter.post("/:id/steps/update-flow-block", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "editor"))) return;
  if (!canEdit(testCase, req.user!)) {
    res.status(403).json({ error: "Only the owner or an admin can edit this test case." });
    return;
  }
  const body = updateFlowBlockSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const updated = await updateFlowBlockInTestCase(
      req.params.id,
      body.data.sourceFlowVersionId,
      body.data.toFlowVersionId,
    );
    broadcast(testCase.projectId, { type: "testcases.updated", testCase: updated! });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

testCasesRouter.get("/:id/data-set", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "viewer"))) return;
  const dataSet = await getTestDataSet(req.params.id);
  res.json(dataSet);
});

const dataSetUploadSchema = z.object({
  text: z.string().min(1).optional(),
  format: z.enum(["csv", "json"]).optional(),
  secretColumns: z.array(z.string()).optional(),
});

testCasesRouter.put("/:id/data-set", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "editor"))) return;
  if (!canEdit(testCase, req.user!)) {
    res.status(403).json({ error: "Only the owner or an admin can edit this test case's data set." });
    return;
  }
  const body = dataSetUploadSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // No new text/format: just re-flag which existing columns are secret,
  // without re-parsing/replacing rows.
  if (!body.data.text || !body.data.format) {
    const dataSet = await updateSecretColumns(req.params.id, body.data.secretColumns ?? []);
    if (!dataSet) {
      res.status(404).json({ error: "No data set to update -- upload one first (with text + format)." });
      return;
    }
    res.json(dataSet);
    return;
  }

  try {
    const parsed = parseTestData(body.data.text, body.data.format);
    const dataSet = await upsertTestDataSet(req.params.id, {
      columns: parsed.columns,
      rows: parsed.rows,
      secretColumns: body.data.secretColumns ?? [],
      source: body.data.format,
    });
    res.json(dataSet);
  } catch (err) {
    if (err instanceof TestDataParseError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

testCasesRouter.delete("/:id/data-set", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "editor"))) return;
  if (!canEdit(testCase, req.user!)) {
    res.status(403).json({ error: "Only the owner or an admin can edit this test case's data set." });
    return;
  }
  await deleteTestDataSet(req.params.id);
  res.status(204).end();
});

const runWithDataSchema = z.object({ environmentId: z.string().optional() });

testCasesRouter.post("/:id/run-with-data", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "viewer"))) return;
  const body = runWithDataSchema.safeParse(req.body ?? {});
  try {
    const result = await runTestCaseAcrossDataSet(
      req.params.id,
      body.success ? body.data.environmentId : undefined,
      env.maxParallelRuns,
      (event) => broadcast(testCase.projectId, event),
    );
    res.status(202).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
