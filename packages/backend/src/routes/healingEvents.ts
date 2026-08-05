import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireProjectRole } from "../auth/projectAccess";
import { approveHealingEvent, dismissHealingEvent, listPendingHealingEvents } from "../db/healingRepo";

export const healingEventsRouter = Router();

/** A healing event has no projectId of its own -- resolve it through
 * testStep -> testCase, the same chain listPendingHealingEvents already
 * filters by. Returns null (having already responded) on 404/403. */
async function resolveHealingEventProject(
  req: Parameters<typeof requireProjectRole>[0],
  res: Parameters<typeof requireProjectRole>[1],
  id: string,
  minRole: "editor" | "viewer",
): Promise<string | null> {
  const event = await prisma.healingEvent.findUnique({
    where: { id },
    include: { testStep: { include: { testCase: true } } },
  });
  if (!event) {
    res.status(404).json({ error: "Healing event not found" });
    return null;
  }
  const projectId = event.testStep.testCase.projectId;
  if (!(await requireProjectRole(req, res, projectId, minRole))) return null;
  return projectId;
}

healingEventsRouter.get("/", async (req, res) => {
  const projectId = req.query.projectId;
  if (typeof projectId !== "string") {
    res.status(400).json({ error: "projectId query param is required" });
    return;
  }
  if (!(await requireProjectRole(req, res, projectId, "viewer"))) return;
  res.json(await listPendingHealingEvents(projectId));
});

const approveSchema = z.object({ makePrimary: z.boolean().default(false) });

healingEventsRouter.post("/:id/approve", async (req, res) => {
  if (!(await resolveHealingEventProject(req, res, req.params.id, "editor"))) return;
  const body = approveSchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const event = await approveHealingEvent(req.params.id, body.data.makePrimary);
  if (!event) {
    res.status(404).json({ error: "Healing event not found" });
    return;
  }
  res.json(event);
});

healingEventsRouter.post("/:id/dismiss", async (req, res) => {
  if (!(await resolveHealingEventProject(req, res, req.params.id, "editor"))) return;
  const event = await dismissHealingEvent(req.params.id);
  if (!event) {
    res.status(404).json({ error: "Healing event not found" });
    return;
  }
  res.json(event);
});
