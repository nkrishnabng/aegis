import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireProjectRole } from "../auth/projectAccess";
import {
  createChangeRequest,
  listChangeRequestsForTestCase,
  resolveChangeRequest,
} from "../db/changeRequestRepo";

// Mounted at /api/testcases/:id/change-requests and /api/change-requests/:id
export const testCaseChangeRequestsRouter = Router({ mergeParams: true });
export const changeRequestsRouter = Router();

const createSchema = z.object({ note: z.string().min(1) });

testCaseChangeRequestsRouter.get<{ id: string }>("/", async (req, res) => {
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "viewer"))) return;
  res.json(await listChangeRequestsForTestCase(req.params.id));
});

testCaseChangeRequestsRouter.post<{ id: string }>("/", async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "note is required" });
    return;
  }
  const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!testCase) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, testCase.projectId, "viewer"))) return;
  const created = await createChangeRequest(req.params.id, req.user!.id, body.data.note);
  res.status(201).json(created);
});

changeRequestsRouter.post("/:id/resolve", async (req, res) => {
  const changeRequest = await prisma.changeRequest.findUnique({
    where: { id: req.params.id },
    include: { testCase: true },
  });
  if (!changeRequest) {
    res.status(404).json({ error: "Change request not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, changeRequest.testCase.projectId, "viewer"))) return;
  const isOwner = changeRequest.testCase.createdById === req.user!.id;
  if (!isOwner && req.user!.role !== "admin") {
    res.status(403).json({ error: "Only the test case owner or an admin can resolve this." });
    return;
  }
  const resolved = await resolveChangeRequest(req.params.id);
  res.json(resolved);
});
