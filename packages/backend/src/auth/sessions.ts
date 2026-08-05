import { randomBytes } from "node:crypto";
import { prisma } from "../db/client";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE_NAME = "sid";

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "member";
}

export async function createSession(userId: string): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id: sessionId, userId, expiresAt } });
  return { sessionId, expiresAt };
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function getUserForSession(sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role === "admin" ? "admin" : "member",
  };
}
