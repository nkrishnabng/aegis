import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "@testingmcp/shared";
import { prisma } from "../db/client";
import { cancelChatTurn, runChatTurnStreaming } from "../agent/agentService";
import { executeTestCase, rerunFailedTestRun } from "../execution/executor";
import { broadcast, joinRoom, leaveRoom, sendToUser } from "./broadcastRegistry";
import { logger } from "../utils/logger";
import { authenticateFromCookieHeader } from "../auth/authMiddleware";

export function attachWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (socket: WebSocket, request) => {
    const user = await authenticateFromCookieHeader(request.headers.cookie);
    if (!user) {
      socket.close(4001, "Not authenticated");
      return;
    }

    const url = new URL(request.url ?? "", "http://localhost");
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      socket.close(4000, "projectId query param is required");
      return;
    }

    joinRoom(projectId, socket, user.id);
    logger.info(`ws: client joined project ${projectId}`);

    socket.on("message", (raw) => {
      void handleMessage(projectId, raw.toString(), user.id);
    });

    socket.on("close", () => leaveRoom(projectId, socket));
    socket.on("error", (err) => logger.warn(`ws: socket error: ${err.message}`));
  });
}

// Shared/asset events reach the whole project room (everyone with access to
// this project should see a proposed test case or a run's progress live);
// everything else -- chat text, agent activity, per-turn errors -- is
// private and only ever reaches the requesting user's own connections, even
// though they're all in the same room. This is the one place that decides
// which side of that line a chat-turn event falls on.
const SHARED_EVENT_TYPES = new Set<ServerToClientMessage["type"]>([
  "testcases.proposed",
  "testcases.updated",
  "usage.update",
]);

function chatEmit(projectId: string, userId: string) {
  return (event: ServerToClientMessage) => {
    if (SHARED_EVENT_TYPES.has(event.type)) {
      broadcast(projectId, event);
    } else {
      sendToUser(projectId, userId, event);
    }
  };
}

async function handleMessage(projectId: string, raw: string, userId: string): Promise<void> {
  let message: ClientToServerMessage;
  try {
    message = JSON.parse(raw);
  } catch {
    sendToUser(projectId, userId, { type: "error", message: "Received malformed message." });
    return;
  }

  try {
    switch (message.type) {
      case "chat.send": {
        const url = message.urlId
          ? await prisma.targetUrl.findUnique({ where: { id: message.urlId } })
          : await prisma.targetUrl.findFirst({ where: { projectId }, orderBy: { lastInspectedAt: "desc" } });

        if (!url) {
          sendToUser(projectId, userId, {
            type: "error",
            message: "Add a target URL to this project before chatting with the agent.",
          });
          return;
        }

        await prisma.targetUrl.update({
          where: { id: url.id },
          data: { lastInspectedAt: new Date() },
        });

        await runChatTurnStreaming(
          projectId,
          url.id,
          url.url,
          message.text,
          userId,
          chatEmit(projectId, userId),
          message.environmentId,
        );
        return;
      }

      case "chat.cancel": {
        cancelChatTurn(message.turnId);
        return;
      }

      case "run.start": {
        await executeTestCase(message.testCaseId, "user", (event) => broadcast(projectId, event), {
          environmentId: message.environmentId,
          continueFromChatSession: message.continueFromChatSession,
          userId,
        });
        return;
      }

      case "run.rerunFailed": {
        await rerunFailedTestRun(
          message.testRunId,
          (event) => broadcast(projectId, event),
          message.resumeFromStepOrder,
        );
        return;
      }

      default:
        sendToUser(projectId, userId, { type: "error", message: "Unknown message type." });
    }
  } catch (err) {
    logger.error("ws: failed to handle message", err);
    sendToUser(projectId, userId, { type: "error", message: (err as Error).message });
  }
}
