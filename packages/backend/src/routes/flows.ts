import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import {
  createFlowVersion,
  deleteFlow,
  getFlow,
  updateFlowMetadata,
} from "../db/flowRepo";
import { stepSchema } from "../agent/customToolSchemas";
import { requireProjectRole } from "../auth/projectAccess";

export const flowsRouter = Router();

/** Only the creator (or an admin) may edit/delete a flow -- mirrors
 * testcases.ts's canEdit. A flow with no recorded owner is editable by
 * anyone (same "legacy" allowance). */
function canEdit(flow: { createdById: string | null }, user: { id: string; role: string }): boolean {
  if (!flow.createdById) return true;
  return flow.createdById === user.id || user.role === "admin";
}

flowsRouter.get("/:id", async (req, res) => {
  const flow = await getFlow(req.params.id);
  if (!flow) {
    res.status(404).json({ error: "Flow not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, flow.projectId, "viewer"))) return;
  res.json(flow);
});

const flowMetadataSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

flowsRouter.put("/:id", async (req, res) => {
  const flow = await prisma.flow.findUnique({ where: { id: req.params.id } });
  if (!flow) {
    res.status(404).json({ error: "Flow not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, flow.projectId, "editor"))) return;
  if (!canEdit(flow, req.user!)) {
    res.status(403).json({ error: "Only the creator or an admin can edit this flow." });
    return;
  }
  const body = flowMetadataSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const updated = await updateFlowMetadata(req.params.id, body.data);
  res.json(updated);
});

flowsRouter.delete("/:id", async (req, res) => {
  const flow = await prisma.flow.findUnique({ where: { id: req.params.id } });
  if (!flow) {
    res.status(204).end();
    return;
  }
  if (!(await requireProjectRole(req, res, flow.projectId, "editor"))) return;
  if (!canEdit(flow, req.user!)) {
    res.status(403).json({ error: "Only the creator or an admin can delete this flow." });
    return;
  }
  await deleteFlow(req.params.id);
  res.status(204).end();
});

const createVersionSchema = z.object({
  steps: z.array(stepSchema),
  note: z.string().optional().nullable(),
});

flowsRouter.post("/:id/versions", async (req, res) => {
  const flow = await prisma.flow.findUnique({ where: { id: req.params.id } });
  if (!flow) {
    res.status(404).json({ error: "Flow not found" });
    return;
  }
  if (!(await requireProjectRole(req, res, flow.projectId, "editor"))) return;
  if (!canEdit(flow, req.user!)) {
    res.status(403).json({ error: "Only the creator or an admin can edit this flow." });
    return;
  }
  const body = createVersionSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const version = await createFlowVersion(req.params.id, body.data.steps, body.data.note ?? null, req.user!.id);
  res.status(201).json(version);
});
