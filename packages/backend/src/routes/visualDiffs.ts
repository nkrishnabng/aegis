import { Router } from "express";
import { prisma } from "../db/client";
import { requireProjectRole } from "../auth/projectAccess";
import { approveVisualDiff, listPendingVisualDiffs, rejectVisualDiff } from "../db/visualDiffRepo";

export const visualDiffsRouter = Router();

/** A visual diff has no projectId of its own -- resolve it through
 * testStep -> testCase, the same chain listPendingVisualDiffs already
 * filters by. Returns null (having already responded) on 404/403. */
async function resolveVisualDiffProject(
  req: Parameters<typeof requireProjectRole>[0],
  res: Parameters<typeof requireProjectRole>[1],
  id: string,
): Promise<string | null> {
  const diff = await prisma.visualDiff.findUnique({
    where: { id },
    include: { testStep: { include: { testCase: true } } },
  });
  if (!diff) {
    res.status(404).json({ error: "Visual diff not found" });
    return null;
  }
  const projectId = diff.testStep.testCase.projectId;
  if (!(await requireProjectRole(req, res, projectId, "editor"))) return null;
  return projectId;
}

visualDiffsRouter.get("/", async (req, res) => {
  const projectId = req.query.projectId;
  if (typeof projectId !== "string") {
    res.status(400).json({ error: "projectId query param is required" });
    return;
  }
  if (!(await requireProjectRole(req, res, projectId, "viewer"))) return;
  res.json(await listPendingVisualDiffs(projectId));
});

visualDiffsRouter.post("/:id/approve", async (req, res) => {
  if (!(await resolveVisualDiffProject(req, res, req.params.id))) return;
  const diff = await approveVisualDiff(req.params.id);
  if (!diff) {
    res.status(404).json({ error: "Visual diff not found" });
    return;
  }
  res.json(diff);
});

visualDiffsRouter.post("/:id/reject", async (req, res) => {
  if (!(await resolveVisualDiffProject(req, res, req.params.id))) return;
  const diff = await rejectVisualDiff(req.params.id);
  if (!diff) {
    res.status(404).json({ error: "Visual diff not found" });
    return;
  }
  res.json(diff);
});
