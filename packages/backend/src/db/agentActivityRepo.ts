import type { AgentActivityEvent } from "@prisma/client";
import type { AgentActivityEventRecord, AgentTurnStage } from "@testingmcp/shared";
import { prisma } from "./client";

function serialize(row: AgentActivityEvent): AgentActivityEventRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    turnId: row.turnId,
    stage: row.stage as AgentTurnStage,
    label: row.label,
    detail: row.detail,
    toolName: row.toolName,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordActivity(input: {
  projectId: string;
  userId: string;
  turnId: string;
  stage: AgentTurnStage;
  label: string;
  detail?: string | null;
  toolName?: string | null;
}): Promise<AgentActivityEventRecord> {
  const row = await prisma.agentActivityEvent.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      turnId: input.turnId,
      stage: input.stage,
      label: input.label,
      detail: input.detail ?? null,
      toolName: input.toolName ?? null,
    },
  });
  return serialize(row);
}

/** Recent activity across turns for one user, oldest first -- enough for a
 * client that just (re)connected to rebuild the timeline for the turn(s)
 * still visible on screen. Always scoped to the requesting user: agent
 * reasoning/activity is as private as the chat that triggered it, same as
 * ChatMessage -- there is no "give me everyone's activity" variant. */
export async function listRecentActivity(
  projectId: string,
  userId: string,
  limit = 200,
): Promise<AgentActivityEventRecord[]> {
  const rows = await prisma.agentActivityEvent.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse().map(serialize);
}
