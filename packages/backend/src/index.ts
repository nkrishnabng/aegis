import http from "node:http";
import express from "express";
import cors from "cors";
import { env } from "./env";
import { logger } from "./utils/logger";
import { projectsRouter } from "./routes/projects";
import { testCasesRouter } from "./routes/testcases";
import { testRunsRouter } from "./routes/testruns";
import { authRouter } from "./routes/auth";
import { environmentsRouter } from "./routes/environments";
import { flowsRouter } from "./routes/flows";
import { healingEventsRouter } from "./routes/healingEvents";
import { visualDiffsRouter } from "./routes/visualDiffs";
import { usersRouter } from "./routes/users";
import { changeRequestsRouter } from "./routes/changeRequests";
import { adminRouter } from "./routes/admin";
import { authMiddleware } from "./auth/authMiddleware";
import { attachWebSocketServer } from "./ws/wsServer";
import { mcpManager } from "./mcp/mcpManager";

const app = express();
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use("/screenshots", express.static(env.screenshotsDir));
app.use("/artifacts", express.static(env.artifactsDir));
app.use("/visual-regression", express.static(env.visualRegressionDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: env.anthropicModel });
});

app.use("/api/auth", authRouter);

app.use("/api/projects", authMiddleware, projectsRouter);
app.use("/api/testcases", authMiddleware, testCasesRouter);
app.use("/api/testruns", authMiddleware, testRunsRouter);
app.use("/api/environments", authMiddleware, environmentsRouter);
app.use("/api/flows", authMiddleware, flowsRouter);
app.use("/api/healing-events", authMiddleware, healingEventsRouter);
app.use("/api/visual-diffs", authMiddleware, visualDiffsRouter);
app.use("/api/users", authMiddleware, usersRouter);
app.use("/api/change-requests", authMiddleware, changeRequestsRouter);
app.use("/api/admin", authMiddleware, adminRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("unhandled request error", err);
  res.status(500).json({ error: err.message });
});

const server = http.createServer(app);
attachWebSocketServer(server);

if (!env.anthropicApiKey) {
  logger.warn(
    "ANTHROPIC_API_KEY is not set -- copy .env.example to .env and add your key before using the chat agent.",
  );
}

server.listen(env.port, () => {
  logger.info(`backend listening on http://localhost:${env.port} (model: ${env.anthropicModel})`);
});

async function shutdown() {
  logger.info("shutting down...");
  await mcpManager.closeAll();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
