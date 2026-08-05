import type { ActivityItem } from "@testingmcp/shared";
import { prisma } from "./client";

const PER_SOURCE_LIMIT = 15;

/** Merges recent test-case generations, run completions, self-healing events,
 * and change-request flags into a single chronological feed -- no new tables,
 * just a union over data already recorded elsewhere for its own purpose. */
export async function listRecentActivity(projectId: string, limit = 8): Promise<ActivityItem[]> {
  const [testCases, runs, healingEvents, changeRequests] = await Promise.all([
    prisma.testCase.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.testRun.findMany({
      where: { testCase: { projectId }, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        status: true,
        finishedAt: true,
        testCase: { select: { title: true } },
      },
    }),
    prisma.healingEvent.findMany({
      where: { testStep: { testCase: { projectId } } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        createdAt: true,
        testStep: { select: { testCase: { select: { title: true } } } },
      },
    }),
    prisma.changeRequest.findMany({
      where: { testCase: { projectId } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        createdAt: true,
        note: true,
        testCaseId: true,
        requestedBy: { select: { username: true } },
        testCase: { select: { title: true } },
      },
    }),
  ]);

  const items: ActivityItem[] = [];

  for (const tc of testCases) {
    items.push({
      kind: "generated",
      message: `Test case created: ${tc.title}`,
      timestamp: tc.createdAt.toISOString(),
      href: `/project/${projectId}/tests/${tc.id}`,
    });
  }

  for (const run of runs) {
    if (!run.finishedAt) continue;
    items.push({
      kind: "run_completed",
      message: `Run ${run.status}: ${run.testCase.title}`,
      timestamp: run.finishedAt.toISOString(),
    });
  }

  for (const event of healingEvents) {
    items.push({
      kind: "healed",
      message: `Self-healed a selector in ${event.testStep.testCase.title}`,
      timestamp: event.createdAt.toISOString(),
      href: `/project/${projectId}/healing`,
    });
  }

  for (const cr of changeRequests) {
    items.push({
      kind: "change_requested",
      message: `${cr.requestedBy.username} flagged ${cr.testCase.title}`,
      detail: cr.note,
      timestamp: cr.createdAt.toISOString(),
      href: `/project/${projectId}/tests/${cr.testCaseId}`,
    });
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
