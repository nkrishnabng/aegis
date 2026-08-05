import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { deleteEnvironment, setEnvironmentCredentials, updateEnvironment } from "../db/environmentRepo";
import { requireProjectRole } from "../auth/projectAccess";
import { recordAudit } from "../db/auditLogRepo";

export const environmentsRouter = Router();

export const environmentInputSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  browser: z.enum(["chromium", "firefox", "webkit"]),
  headless: z.boolean(),
  viewportWidth: z.number().int().positive(),
  viewportHeight: z.number().int().positive(),
  isDefault: z.boolean(),
});

/** Environments are only ever reached via an environment id (not
 * project-scoped in the URL themselves), so each route resolves the parent
 * project id itself before checking access. */
async function resolveEnvironmentProject(
  req: Parameters<typeof requireProjectRole>[0],
  res: Parameters<typeof requireProjectRole>[1],
  environmentId: string,
  minRole: "editor" | "owner",
): Promise<string | null> {
  const environment = await prisma.environment.findUnique({ where: { id: environmentId } });
  if (!environment) {
    res.status(404).json({ error: "Environment not found" });
    return null;
  }
  if (!(await requireProjectRole(req, res, environment.projectId, minRole))) return null;
  return environment.projectId;
}

environmentsRouter.put("/:id", async (req, res) => {
  // Metadata (name/baseUrl/browser/viewport) is editor-level; credentials
  // and deletion require owner (see below).
  const projectId = await resolveEnvironmentProject(req, res, req.params.id, "editor");
  if (!projectId) return;
  const body = environmentInputSchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const environment = await updateEnvironment(req.params.id, body.data);
  res.json(environment);
});

environmentsRouter.delete("/:id", async (req, res) => {
  const projectId = await resolveEnvironmentProject(req, res, req.params.id, "owner");
  if (!projectId) return;
  await deleteEnvironment(req.params.id);
  await recordAudit({
    userId: req.user!.id,
    projectId,
    action: "environment.deleted",
    targetType: "Environment",
    targetId: req.params.id,
  });
  res.status(204).send();
});

const credentialsSchema = z.object({ values: z.record(z.string()) });

environmentsRouter.put("/:id/credentials", async (req, res) => {
  const projectId = await resolveEnvironmentProject(req, res, req.params.id, "owner");
  if (!projectId) return;
  const body = credentialsSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Body must be { values: Record<string, string> }" });
    return;
  }
  const environment = await setEnvironmentCredentials(req.params.id, body.data.values);
  await recordAudit({
    userId: req.user!.id,
    projectId,
    action: "environment.credentials_updated",
    targetType: "Environment",
    targetId: req.params.id,
  });
  res.json(environment);
});
