import type { AuditLogEntryRecord } from "@testingmcp/shared";
import type { AuditLogEntry, User } from "@prisma/client";
import { prisma } from "./client";

function serialize(row: AuditLogEntry & { user: User | null }): AuditLogEntryRecord {
  return {
    id: row.id,
    userId: row.userId,
    username: row.user?.username ?? null,
    projectId: row.projectId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RecordAuditInput {
  userId?: string | null;
  projectId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
}

/** Fire-and-forget-friendly: callers should still `await` this (it's a
 * single insert, not a network call) but a logging failure must never take
 * down the mutation it's describing -- wrap call sites in try/catch if
 * that's a concern, though a local SQLite insert failing here would
 * indicate a much bigger problem. */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  await prisma.auditLogEntry.create({
    data: {
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      detail: input.detail ?? null,
    },
  });
}

export async function listAuditLog(projectId: string, limit = 200): Promise<AuditLogEntryRecord[]> {
  const rows = await prisma.auditLogEntry.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serialize);
}
