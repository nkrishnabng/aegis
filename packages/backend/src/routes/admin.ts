import { Router } from "express";
import type { AdminConfig } from "@testingmcp/shared";
import { env } from "../env";

export const adminRouter = Router();

adminRouter.get("/config", (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin only." });
    return;
  }
  const config: AdminConfig = {
    model: env.anthropicModel,
    credentialEncryptionConfigured: env.credentialEncryptionKey.length > 0,
    defaultBrowser: env.playwrightBrowser,
    defaultHeadless: env.playwrightHeadless,
    maxParallelRuns: env.maxParallelRuns,
    webhookConfigured: env.webhookUrl.length > 0,
  };
  res.json(config);
});
