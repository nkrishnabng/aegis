import type { ProjectMemberRecord, ProjectRole, UserSummary } from "@testingmcp/shared";
import type { ProjectMember, User } from "@prisma/client";
import { prisma } from "./client";

function serializeUserSummary(user: User): UserSummary {
  return { id: user.id, username: user.username, role: user.role === "admin" ? "admin" : "member" };
}

function serializeMember(row: ProjectMember & { user: User }): ProjectMemberRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    user: serializeUserSummary(row.user),
    role: row.role as ProjectRole,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMembers(projectId: string): Promise<ProjectMemberRecord[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeMember);
}

/** A global admin (User.role === "admin") is always treated as "owner" on
 * every project, regardless of membership -- same bypass every other
 * ownership check in this app already grants admins. Returns null if the
 * user isn't an admin and has no ProjectMember row (no access at all). */
export async function getEffectiveProjectRole(
  user: { id: string; role: string },
  projectId: string,
): Promise<ProjectRole | null> {
  if (user.role === "admin") return "owner";
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  return member ? (member.role as ProjectRole) : null;
}

export async function addMember(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMemberRecord> {
  const row = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role },
    update: { role },
    include: { user: true },
  });
  return serializeMember(row);
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMemberRecord | null> {
  const row = await prisma.projectMember
    .update({ where: { projectId_userId: { projectId, userId } }, data: { role }, include: { user: true } })
    .catch(() => null);
  return row ? serializeMember(row) : null;
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await prisma.projectMember.deleteMany({ where: { projectId, userId } });
}
