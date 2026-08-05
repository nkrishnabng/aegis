"use client";

import { useEffect, useRef } from "react";
import type { ClientToServerMessage, ServerToClientMessage } from "@testingmcp/shared";
import { WS_BASE_URL } from "./config";

/** Opens (and keeps open) one WebSocket per project, forwarding every
 * server message to `onMessage`. Returns a `send` function for chat/run
 * commands. Reconnects automatically with a short backoff if the
 * connection drops. */
export function useProjectSocket(
  projectId: string | null,
  onMessage: (event: ServerToClientMessage) => void,
) {
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      const socket = new WebSocket(`${WS_BASE_URL}/ws?projectId=${projectId}`);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as ServerToClientMessage;
          onMessageRef.current(parsed);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(connect, 1500);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [projectId]);

  function send(message: ClientToServerMessage) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }

  return { send };
}
