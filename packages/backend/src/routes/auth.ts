import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { createSession, destroySession, SESSION_COOKIE_NAME } from "../auth/sessions";
import { parseCookies } from "../auth/cookies";
import { authMiddleware } from "../auth/authMiddleware";

export const authRouter = Router();

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

authRouter.post("/login", async (req, res) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { username: body.data.username } });
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const { sessionId, expiresAt } = await createSession(user.id);
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  res.json({ id: user.id, username: user.username, role: user.role === "admin" ? "admin" : "member" });
});

authRouter.post("/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (sessionId) await destroySession(sessionId);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.status(204).send();
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  res.json(req.user);
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

// Self-service, distinct from the admin-only PUT /api/users/:id -- this
// requires proving the current password rather than an admin's say-so, and
// only invalidates *other* sessions/devices, not the one making this
// request, so changing your own password doesn't also log you out.
authRouter.put("/password", authMiddleware, async (req, res) => {
  const body = changePasswordSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !verifyPassword(body.data.currentPassword, user.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(body.data.newPassword) },
  });
  const cookies = parseCookies(req.headers.cookie);
  const currentSessionId = cookies[SESSION_COOKIE_NAME];
  await prisma.session.deleteMany({
    where: { userId: user.id, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) },
  });
  res.status(204).send();
});
