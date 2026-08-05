import type Anthropic from "@anthropic-ai/sdk";
import type { ChatMessageRecord } from "@testingmcp/shared";
import { prisma } from "./client";
import { serializeChatMessage } from "./serializers";

export async function appendChatMessage(
  projectId: string,
  userId: string,
  role: "user" | "assistant",
  content: string,
): Promise<ChatMessageRecord> {
  const message = await prisma.chatMessage.create({
    data: { projectId, userId, role, content },
  });
  return serializeChatMessage(message);
}

/** Always scoped to one user's own conversation -- there is no "give me
 * every message in this project" variant. Chat is private; only the
 * generated test cases it produces become a shared project asset. */
export async function listChatMessages(
  projectId: string,
  userId: string,
): Promise<ChatMessageRecord[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "asc" },
  });
  return messages.map(serializeChatMessage);
}

export function toAnthropicHistory(
  messages: ChatMessageRecord[],
): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
