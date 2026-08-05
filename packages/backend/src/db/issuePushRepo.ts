import type { IntegrationType, IssuePushRecord } from "@testingmcp/shared";
import { prisma } from "./client";
import { serializeIssuePush } from "./serializers";

export async function getPushForTestRun(
  testRunId: string,
  type: IntegrationType,
): Promise<IssuePushRecord | null> {
  const row = await prisma.issuePush.findFirst({ where: { testRunId, type }, orderBy: { createdAt: "desc" } });
  return row ? serializeIssuePush(row) : null;
}

export async function createPendingPush(testRunId: string, type: IntegrationType): Promise<IssuePushRecord> {
  const row = await prisma.issuePush.create({ data: { testRunId, type, status: "pending" } });
  return serializeIssuePush(row);
}

export async function markPushed(
  id: string,
  issue: { issueKey: string; issueUrl: string },
): Promise<IssuePushRecord> {
  const row = await prisma.issuePush.update({
    where: { id },
    data: {
      status: "pushed",
      issueKey: issue.issueKey,
      issueUrl: issue.issueUrl,
      pushedAt: new Date(),
    },
  });
  return serializeIssuePush(row);
}

export async function markFailed(id: string, errorMessage: string): Promise<IssuePushRecord> {
  const row = await prisma.issuePush.update({
    where: { id },
    data: { status: "failed", errorMessage },
  });
  return serializeIssuePush(row);
}
