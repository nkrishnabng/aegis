import type { ServerToClientMessage } from "@testingmcp/shared";
import type { WebSocket } from "ws";

// projectId -> (socket -> the userId that socket authenticated as). A room
// is still one per project (not per user) since shared-asset events
// (testcases.proposed/updated, run.progress, healing.detected, ...) need to
// reach everyone on the project -- but tracking each socket's owner lets
// sendToUser() target private events (chat, agent activity) to just one
// person within that shared room.
const rooms = new Map<string, Map<WebSocket, string>>();

export function joinRoom(projectId: string, socket: WebSocket, userId: string): void {
  let room = rooms.get(projectId);
  if (!room) {
    room = new Map();
    rooms.set(projectId, room);
  }
  room.set(socket, userId);
}

export function leaveRoom(projectId: string, socket: WebSocket): void {
  const room = rooms.get(projectId);
  if (!room) return;
  room.delete(socket);
  if (room.size === 0) rooms.delete(projectId);
}

export function broadcast(projectId: string, message: ServerToClientMessage): void {
  const room = rooms.get(projectId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const socket of room.keys()) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

/** Delivers a message only to sockets belonging to one user within a
 * project's room (e.g. the same user's own conversation open in two tabs
 * still both get it) -- never to any other member of the project, even
 * though they're all connected to the same room. Use for anything that
 * shouldn't cross the private/shared boundary: chat messages, streaming
 * text, agent activity, per-turn errors. */
export function sendToUser(projectId: string, userId: string, message: ServerToClientMessage): void {
  const room = rooms.get(projectId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const [socket, socketUserId] of room) {
    if (socketUserId === userId && socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}
