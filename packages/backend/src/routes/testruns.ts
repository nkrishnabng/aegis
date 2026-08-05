import { Router } from "express";
import { z } from "zod";
import type { IntegrationType, RunStatus } from "@testingmcp/shared";
import { prisma } from "../db/client";
import { serializeTestRun, serializeTestRunResult } from "../db/serializers";
import { rerunFailedTestRun } from "../execution/executor";
import { buildJunitXml, type BatchRunSummary } from "../execution/junitReport";
import { buildHtmlReport } from "../execution/htmlReport";
import { getIntegrationForPush } from "../db/integrationRepo";
import { createPendingPush, getPushForTestRun, markFailed, markPushed } from "../db/issuePushRepo";
import { getAdapter } from "../integrations/adapterFactory";
import { broadcast } from "../ws/broadcastRegistry";

export const testRunsRouter = Router();

const include = {
  results: { include: { screenshots: true } },
  logs: true,
  // At most one integration per (project, type) and a handful of pushes per
  // run over its lifetime -- no need for a tight `take` cap.
  issuePushes: { orderBy: { createdAt: "desc" as const } },
} as const;

async function loadBatchRunSummaries(batchId: string): Promise<BatchRunSummary[]> {
  const runs = await prisma.testRun.findMany({
    where: { batchId },
    include: { testCase: { select: { title: true } }, results: { select: { errorMessage: true } } },
    orderBy: { startedAt: "asc" },
  });
  return runs.map((run) => ({
    id: run.id,
    testCaseTitle: run.testCase.title,
    status: run.status as RunStatus,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    durationMs:
      run.finishedAt && run.startedAt ? Math.max(0, run.finishedAt.getTime() - run.startedAt.getTime()) : 0,
    errorMessage: run.results.find((r) => r.errorMessage)?.errorMessage ?? null,
  }));
}

testRunsRouter.get("/:id", async (req, res) => {
  const run = await prisma.testRun.findUnique({ where: { id: req.params.id }, include });
  if (!run) {
    res.status(404).json({ error: "Test run not found" });
    return;
  }
  const record = serializeTestRun(run);
  if (run.resumedFromRunId && run.resumedFromStepOrder) {
    const sourceResults = await prisma.testRunResult.findMany({
      where: { testRunId: run.resumedFromRunId, stepOrder: { lt: run.resumedFromStepOrder } },
      include: { screenshots: true },
      orderBy: { stepOrder: "asc" },
    });
    record.inheritedResults = sourceResults.map(serializeTestRunResult);
  }
  res.json(record);
});

testRunsRouter.get("/by-testcase/:testCaseId", async (req, res) => {
  const runs = await prisma.testRun.findMany({
    where: { testCaseId: req.params.testCaseId },
    include,
    orderBy: { startedAt: "desc" },
  });
  res.json(runs.map(serializeTestRun));
});

testRunsRouter.get("/:id/trace", async (req, res) => {
  const run = await prisma.testRun.findUnique({ where: { id: req.params.id }, include });
  if (!run) {
    res.status(404).json({ error: "Test run not found" });
    return;
  }
  const testRun = serializeTestRun(run);
  res.json({
    testRun,
    consoleLogs: testRun.logs.filter((l) => l.category === "console"),
    networkLogs: testRun.logs.filter((l) => l.category === "network"),
  });
});

testRunsRouter.get("/batch/:batchId/junit", async (req, res) => {
  const runs = await loadBatchRunSummaries(req.params.batchId);
  if (runs.length === 0) {
    res.status(404).json({ error: "No runs found for that batch id" });
    return;
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(buildJunitXml(req.params.batchId, runs));
});

testRunsRouter.get("/batch/:batchId/html", async (req, res) => {
  const runs = await loadBatchRunSummaries(req.params.batchId);
  if (runs.length === 0) {
    res.status(404).json({ error: "No runs found for that batch id" });
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(buildHtmlReport(req.params.batchId, runs));
});

const pushParamsSchema = z.object({ type: z.enum(["jira", "githubIssues", "azureDevOps"]) });

testRunsRouter.post("/:id/push-to/:type", async (req, res) => {
  const params = pushParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "type must be jira, githubIssues, or azureDevOps" });
    return;
  }
  const type: IntegrationType = params.data.type;

  const run = await prisma.testRun.findUnique({
    where: { id: req.params.id },
    include: { testCase: true, results: { include: { testStep: { select: { description: true } } } } },
  });
  if (!run) {
    res.status(404).json({ error: "Test run not found" });
    return;
  }

  const existing = await getPushForTestRun(run.id, type);
  if (existing?.status === "pushed") {
    // Idempotent: a repeat click returns the already-created issue instead
    // of creating a duplicate.
    res.json(existing);
    return;
  }

  const integration = await getIntegrationForPush(run.testCase.projectId, type);
  if (!integration) {
    res.status(400).json({
      error: `${type} integration not configured for this project. Configure it on the Integrations page first.`,
    });
    return;
  }

  const failedResults = run.results.filter((r) => r.status === "failed" || r.status === "error");
  const title = `${run.testCase.title} — failed run ${run.id.slice(-8)}`;
  const descriptionParts = [
    `Objective: ${run.testCase.objective}`,
    ...failedResults.map((r) => {
      const lines = [`Step: ${r.testStep.description}`];
      if (r.errorMessage) lines.push(`Error: ${r.errorMessage}`);
      if (r.suggestedFix) lines.push(`Suggested fix: ${r.suggestedFix}`);
      return lines.join("\n");
    }),
  ];
  const description = descriptionParts.join("\n\n");

  const push = await createPendingPush(run.id, type);
  try {
    const adapter = getAdapter(integration);
    const issue = await adapter.createIssue({ title, description });
    const updated = await markPushed(push.id, { issueKey: issue.key, issueUrl: issue.url });
    res.status(201).json(updated);
  } catch (err) {
    // A handled failure (e.g. the tracker rejected the request) is still a
    // successfully-processed push *attempt* -- the outcome (including the
    // error) is business-level data in the IssuePushRecord body, not an HTTP
    // error, so the frontend can read `errorMessage` off a normal 200
    // response instead of a non-ok status whose body shape it doesn't expect.
    const updated = await markFailed(push.id, (err as Error).message);
    res.status(200).json(updated);
  }
});

const rerunBodySchema = z.object({ resumeFromStepOrder: z.number().int().positive().optional() });

testRunsRouter.post("/:id/rerun", async (req, res) => {
  const previous = await prisma.testRun.findUnique({ where: { id: req.params.id } });
  if (!previous) {
    res.status(404).json({ error: "Test run not found" });
    return;
  }
  const body = rerunBodySchema.safeParse(req.body ?? {});
  const testCase = await prisma.testCase.findUniqueOrThrow({ where: { id: previous.testCaseId } });
  try {
    const run = await rerunFailedTestRun(
      req.params.id,
      (event) => broadcast(testCase.projectId, event),
      body.success ? body.data.resumeFromStepOrder : undefined,
    );
    res.status(201).json(run);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
