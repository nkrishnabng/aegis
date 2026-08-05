import type { UserSummary } from "@testingmcp/shared";
import { prisma } from "./client";
import { hashPassword } from "../auth/passwords";

function serializeUser(user: { id: string; username: string; role: string }): UserSummary {
  return { id: user.id, username: user.username, role: user.role === "admin" ? "admin" : "member" };
}

export async function listUsers(): Promise<UserSummary[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(serializeUser);
}

export async function createUser(
  username: string,
  password: string,
  role: "admin" | "member",
): Promise<UserSummary> {
  const user = await prisma.user.create({
    data: { username, passwordHash: hashPassword(password), role },
  });
  return serializeUser(user);
}

export async function getUserSummary(userId: string): Promise<UserSummary | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? serializeUser(user) : null;
}

/** For a project owner's "Add member" picker -- every user not already a
 * member of this project. Deliberately narrower than the admin-only
 * `listUsers` (id/username/role only, and only non-members), so exposing it
 * to project owners (who aren't necessarily site admins) doesn't reopen the
 * "any user can list every account" gap that route used to have. */
export async function listUsersNotInProject(projectId: string): Promise<UserSummary[]> {
  const users = await prisma.user.findMany({
    where: { projectMemberships: { none: { projectId } } },
    orderBy: { username: "asc" },
  });
  return users.map(serializeUser);
}

/** Admin-only edit: change a user's role and/or reset their password. A
 * password reset invalidates all of that user's existing sessions (there's
 * no session/password versioning, so this is the only way to force
 * re-login) -- role-only changes leave sessions alone. */
export async function updateUser(
  userId: string,
  updates: { password?: string; role?: "admin" | "member" },
): Promise<UserSummary | null> {
  const data: { passwordHash?: string; role?: string } = {};
  if (updates.password) data.passwordHash = hashPassword(updates.password);
  if (updates.role) data.role = updates.role;

  const user = await prisma.user.update({ where: { id: userId }, data }).catch(() => null);
  if (!user) return null;
  if (updates.password) {
    await prisma.session.deleteMany({ where: { userId } });
  }
  return serializeUser(user);
}
