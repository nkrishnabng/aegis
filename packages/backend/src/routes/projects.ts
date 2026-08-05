import { Router } from "express";
import { z } from "zod";
import { PROJECT_ROLES, type ProjectRole } from "@testingmcp/shared";
import { prisma } from "../db/client";
import {
  serializeProject,
  serializeTestCase,
} from "../db/serializers";
import { listChatMessages } from "../db/chatRepo";
import { getUsageTotals } from "../db/usageRepo";
import { createEnvironment, listEnvironments } from "../db/environmentRepo";
import { environmentInputSchema } from "./environments";
import { createFlow, listFlows } from "../db/flowRepo";
import { stepSchema } from "../agent/customToolSchemas";
import { getIntegration, upsertIntegration } from "../db/integrationRepo";
import {
  addMember,
  getEffectiveProjectRole,
  listMembers,
  removeMember,
  updateMemberRole,
} from "../db/projectMemberRepo";
import { listAuditLog, recordAudit } from "../db/auditLogRepo";
import { listUsersNotInProject } from "../db/userRepo";
import { listRecentActivity } from "../db/agentActivityRepo";
import { requireProjectRole, roleMeets } from "../auth/projectAccess";
import { runApprovedTestCasesBatch } from "../execution/executor";
import { exportProjectAsCiPackage } from "../execution/ciExporter";
import { getDashboardSummary } from "../db/dashboardRepo";
import { listFailingTests } from "../db/failingTestsRepo";
import { getRunsTimeSeries } from "../db/reportsRepo";
import { broadcast } from "../ws/broadcastRegistry";
import { env } from "../env";

export const projectsRouter = Router();

/** Runs for every route matching a `:id` param below -- resolves the
 * requesting user's project role (a global admin is always "owner") and
 * 403s if they're not a member at all. Individual routes that need more
 * than bare membership (editor/owner) layer an extra `roleMeets` check on
 * top; this is the shared "viewer" floor. */
projectsRouter.param("id", async (req, res, next, id) => {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const role = await getEffectiveProjectRole(req.user!, id);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this project." });
    return;
  }
  req.projectRole = role;
  next();
});

function requireRole(req: Parameters<typeof requireProjectRole>[0], res: Parameters<typeof requireProjectRole>[1], minRole: ProjectRole): boolean {
  if (!roleMeets(req.projectRole!, minRole)) {
    res.status(403).json({ error: `This action requires at least "${minRole}" access to this project.` });
    return false;
  }
  return true;
}

projectsRouter.get("/", async (req, res) => {
  const isAdmin = req.user!.role === "admin";
  const projects = await prisma.project.findMany({
    where: isAdmin ? undefined : { members: { some: { userId: req.user!.id } } },
    include: { urls: true, members: { where: { userId: req.user!.id } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    projects.map((p) => ({
      ...serializeProject(p),
      myRole: isAdmin ? ("owner" as const) : ((p.members[0]?.role as ProjectRole | undefined) ?? undefined),
    })),
  );
});

projectsRouter.post("/", async (req, res) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const project = await prisma.project.create({
    data: {
      name: body.data.name,
      members: { create: { userId: req.user!.id, role: "owner" } },
    },
    include: { urls: true },
  });
  await recordAudit({
    userId: req.user!.id,
    projectId: project.id,
    action: "project.created",
    targetType: "Project",
    targetId: project.id,
  });
  res.status(201).json({ ...serializeProject(project), myRole: "owner" as const });
});

projectsRouter.get("/:id", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { urls: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json({ ...serializeProject(project), myRole: req.projectRole });
});

const renameProjectSchema = z.object({ name: z.string().min(1) });

projectsRouter.put("/:id", async (req, res) => {
  if (!requireRole(req, res, "owner")) return;
  const body = renameProjectSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const project = await prisma.project
    .update({ where: { id: req.params.id }, data: { name: body.data.name }, include: { urls: true } })
    .catch(() => null);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  await recordAudit({
    userId: req.user!.id,
    projectId: project.id,
    action: "project.renamed",
    targetType: "Project",
    targetId: project.id,
    detail: body.data.name,
  });
  res.json({ ...serializeProject(project), myRole: req.projectRole });
});

projectsRouter.delete("/:id", async (req, res) => {
  if (!requireRole(req, res, "owner")) return;
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) {
    res.status(204).end();
    return;
  }
  // Recorded before the delete, using the still-valid projectId -- the
  // AuditLogEntry.project relation is onDelete: SetNull, so this row
  // survives (projectId nulled out) rather than vanishing with the project,
  // same "durable record" pattern as every other audit entry.
  await recordAudit({
    userId: req.user!.id,
    projectId: project.id,
    action: "project.deleted",
    targetType: "Project",
    targetId: project.id,
    detail: project.name,
  });
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

projectsRouter.get("/:id/members", async (req, res) => {
  res.json(await listMembers(req.params.id));
});

// Backs the "Add member" picker -- owner-only (matches the add/role-change/
// remove routes below), and deliberately scoped to "not already a member of
// this project" rather than the full user list `/api/users` returns.
projectsRouter.get("/:id/available-members", async (req, res) => {
  if (!requireRole(req, res, "owner")) return;
  res.json(await listUsersNotInProject(req.params.id));
});

const addMemberSchema = z.object({
  username: z.string().min(1),
  role: z.enum(PROJECT_ROLES),
});

projectsRouter.post("/:id/members", async (req, res) => {
  if (!requireRole(req, res, "owner")) return;
  const body = addMemberSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const user = await prisma.user.findUnique({ where: { username: body.data.username } });
  if (!user) {
    res.status(404).json({ error: `No user named "${body.data.username}".` });
    return;
  }
  const member = await addMember(req.params.id, user.id, body.data.role);
  await recordAudit({
    userId: req.user!.id,
    projectId: req.params.id,
    action: "member.added",
    targetType: "User",
    targetId: user.id,
    detail: `role=${body.data.role}`,
  });
  res.status(201).json(member);
});

const updateMemberSchema = z.object({ role: z.enum(PROJECT_ROLES) });

projectsRouter.put("/:id/members/:userId", async (req, res) => {
  if (!requireRole(req, res, "owner")) return;
  const body = updateMemberSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const member = await updateMemberRole(req.params.id, req.params.userId, body.data.role);
  if (!member) {
    res.status(404).json({ error: "That user isn't a member of this project." });
    return;
  }
  await recordAudit({
    userId: req.user!.id,
    projectId: req.params.id,
    action: "member.role_changed",
    targetType: "User",
    targetId: req.params.userId,
    detail: `role=${body.data.role}`,
  });
  res.json(member);
});

projectsRouter.delete("/:id/members/:userId", async (req, res) => {
  if (!requireRole(req, res, "owner")) return;
  await removeMember(req.params.id, req.params.userId);
  await recordAudit({
    userId: req.user!.id,
    projectId: req.params.id,
    action: "member.removed",
    targetType: "User",
    targetId: req.params.userId,
  });
  res.status(204).end();
});

projectsRouter.get("/:id/audit-log", async (req, res) => {
  res.json(await listAuditLog(req.params.id));
});

const urlSchema = z.object({ url: z.string().url() });

projectsRouter.post("/:id/urls", async (req, res) => {
  if (!requireRole(req, res, "editor")) return;
  const body = urlSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "A valid absolute URL is required." });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Best-effort reachability check -- never blocks creation, since many
  // target apps (localhost, auth-gated) won't respond to a bare fetch from
  // the server process, but a totally malformed/unresolvable host is worth
  // surfacing early.
  let reachable = true;
  let reachabilityNote: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(body.data.url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    reachable = false;
    reachabilityNote = (err as Error).message;
  }

  const targetUrl = await prisma.targetUrl.create({
    data: { projectId: project.id, url: body.data.url },
  });

  res.status(201).json({
    url: {
      id: targetUrl.id,
      projectId: targetUrl.projectId,
      url: targetUrl.url,
      title: targetUrl.title,
      lastInspectedAt: null,
    },
    reachable,
    reachabilityNote,
  });
});

projectsRouter.get("/:id/testcases", async (req, res) => {
  const testCases = await prisma.testCase.findMany({
    where: { projectId: req.params.id },
    include: {
      steps: true,
      createdBy: true,
      lastModifiedBy: true,
      _count: { select: { changeRequests: { where: { status: "open" } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(testCases.map(serializeTestCase));
});

// Always the requesting user's own conversation -- chat is private per user,
// never shared across a project's members (see the ChatMessage schema
// comment). There is deliberately no "give me everyone's chat" variant.
projectsRouter.get("/:id/chat", async (req, res) => {
  res.json(await listChatMessages(req.params.id, req.user!.id));
});

// Backs the activity timeline's refresh-recovery: a client that just loaded
// (or reconnected) fetches whatever already happened, then live `agent.activity`
// WS events append to it from there. Always the requesting user's own
// activity -- same privacy scope as chat.
projectsRouter.get("/:id/agent-activity", async (req, res) => {
  res.json(await listRecentActivity(req.params.id, req.user!.id));
});

projectsRouter.get("/:id/usage", async (req, res) => {
  res.json(await getUsageTotals(req.params.id));
});

projectsRouter.get("/:id/dashboard", async (req, res) => {
  res.json(await getDashboardSummary(req.params.id));
});

projectsRouter.get("/:id/failing-tests", async (req, res) => {
  res.json(await listFailingTests(req.params.id));
});

projectsRouter.get("/:id/reports", async (req, res) => {
  res.json({ timeSeriesDays: await getRunsTimeSeries(req.params.id) });
});

projectsRouter.get("/:id/environments", async (req, res) => {
  res.json(await listEnvironments(req.params.id));
});

projectsRouter.post("/:id/environments", async (req, res) => {
  if (!requireRole(req, res, "editor")) return;
  const body = environmentInputSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const environment = await createEnvironment(req.params.id, body.data);
  res.status(201).json(environment);
});

projectsRouter.get("/:id/flows", async (req, res) => {
  res.json(await listFlows(req.params.id));
});

const createFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  steps: z.array(stepSchema),
});

projectsRouter.post("/:id/flows", async (req, res) => {
  if (!requireRole(req, res, "editor")) return;
  const body = createFlowSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const flow = await createFlow(
      req.params.id,
      { name: body.data.name, description: body.data.description },
      body.data.steps,
      req.user!.id,
    );
    res.status(201).json(flow);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

projectsRouter.get("/:id/integrations", async (req, res) => {
  const [jira, githubIssues, azureDevOps] = await Promise.all([
    getIntegration(req.params.id, "jira"),
    getIntegration(req.params.id, "githubIssues"),
    getIntegration(req.params.id, "azureDevOps"),
  ]);
  res.json({ jira, githubIssues, azureDevOps });
});

// `email` isn't a real email address for githubIssues/azureDevOps (they
// have no such concept) -- just an unvalidated free-text field those two
// types leave blank; only jira actually requires it to look like an email.
const integrationInputSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string(),
  projectKey: z.string().min(1),
  apiToken: z.string().min(1).optional(),
});

const integrationTypeSchema = z.enum(["jira", "githubIssues", "azureDevOps"]);

projectsRouter.put("/:id/integrations/:type", async (req, res) => {
  // Project-owner (which a global admin always is) rather than a blanket
  // global-admin-only gate -- lets a project owner who isn't a site-wide
  // admin manage their own project's tracker credentials, the same
  // "owner manages this project's sensitive config" scope everything else
  // in this RBAC model follows.
  if (!requireRole(req, res, "owner")) return;
  const typeResult = integrationTypeSchema.safeParse(req.params.type);
  if (!typeResult.success) {
    res.status(400).json({ error: "type must be jira, githubIssues, or azureDevOps" });
    return;
  }
  const body = integrationInputSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const integration = await upsertIntegration(req.params.id, typeResult.data, body.data);
    await recordAudit({
      userId: req.user!.id,
      projectId: req.params.id,
      action: "integration.updated",
      targetType: "Integration",
      targetId: integration.id,
      detail: `type=${typeResult.data}`,
    });
    res.json(integration);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

projectsRouter.get("/:id/export-ci", async (req, res) => {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="aegisqa-ci-export.zip"');
  try {
    await exportProjectAsCiPackage(req.params.id, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: (err as Error).message });
    } else {
      res.destroy(err as Error);
    }
  }
});

const runAllSchema = z.object({
  environmentId: z.string().optional(),
  continueFromChatSession: z.boolean().optional(),
});

projectsRouter.post("/:id/testcases/run-all", async (req, res) => {
  const body = runAllSchema.safeParse(req.body ?? {});
  const environmentId = body.success ? body.data.environmentId : undefined;
  try {
    const result = await runApprovedTestCasesBatch(
      req.params.id,
      environmentId,
      env.maxParallelRuns,
      (event) => broadcast(req.params.id, event),
      body.success ? body.data.continueFromChatSession : undefined,
      req.user!.id,
    );
    res.status(202).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
