import type { Prisma } from "@prisma/client";
import type { ChangeRequestRecord } from "@testingmcp/shared";
import { prisma } from "./client";

const include = { requestedBy: true, testCase: { select: { title: true } } } as const;

type ChangeRequestRow = Prisma.ChangeRequestGetPayload<{ include: typeof include }>;

function serialize(row: ChangeRequestRow): ChangeRequestRecord {
  return {
    id: row.id,
    testCaseId: row.testCaseId,
    testCaseTitle: row.testCase.title,
    requestedBy: {
      id: row.requestedBy.id,
      username: row.requestedBy.username,
      role: row.requestedBy.role === "admin" ? "admin" : "member",
    },
    note: row.note,
    status: row.status === "resolved" ? "resolved" : "open",
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export async function createChangeRequest(
  testCaseId: string,
  requestedById: string,
  note: string,
): Promise<ChangeRequestRecord> {
  const row = await prisma.changeRequest.create({
    data: { testCaseId, requestedById, note },
    include,
  });
  return serialize(row);
}

export async function listChangeRequestsForTestCase(testCaseId: string): Promise<ChangeRequestRecord[]> {
  const rows = await prisma.changeRequest.findMany({
    where: { testCaseId },
    include,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serialize);
}

export async function listOpenChangeRequestsForProject(
  projectId: string,
  limit = 20,
): Promise<ChangeRequestRecord[]> {
  const rows = await prisma.changeRequest.findMany({
    where: { status: "open", testCase: { projectId } },
    include,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serialize);
}

export async function countOpenChangeRequestsForProject(projectId: string): Promise<number> {
  return prisma.changeRequest.count({ where: { status: "open", testCase: { projectId } } });
}

export async function resolveChangeRequest(id: string): Promise<ChangeRequestRecord | null> {
  const existing = await prisma.changeRequest.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.changeRequest.update({
    where: { id },
    data: { status: "resolved", resolvedAt: new Date() },
    include,
  });
  return serialize(row);
}
