import type { FailingTestRecord, RunStatus, TestCasePriority } from "@testingmcp/shared";
import { prisma } from "./client";
import { getLatestStatusByTestCase } from "./dashboardRepo";

const PRIORITY_SEVERITY: Record<TestCasePriority, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/** Every test case whose latest run failed/errored, project-wide and uncapped
 * (unlike the dashboard's top-10 card) -- the full drill-down view. */
export async function listFailingTests(projectId: string): Promise<FailingTestRecord[]> {
  const testCases = await prisma.testCase.findMany({
    where: { projectId },
    select: { id: true, title: true, priority: true, module: true },
  });

  const { latestStatusByTestCase } = await getLatestStatusByTestCase(testCases.map((tc) => tc.id));
  const failingIds = testCases
    .filter((tc) => {
      const status = latestStatusByTestCase.get(tc.id);
      return status === "failed" || status === "error";
    })
    .map((tc) => tc.id);

  const latestRunByTestCase = new Map<
    string,
    { id: string; status: string; errorMessage: string | null; finishedAt: Date | null }
  >();
  for (const id of failingIds) {
    const run = await prisma.testRun.findFirst({
      where: { testCaseId: id },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, finishedAt: true },
    });
    // TestRun has no errorMessage column -- it lives on TestRunResult. Pull the
    // first failing result's message for this run, if any.
    let errorMessage: string | null = null;
    if (run) {
      const failedResult = await prisma.testRunResult.findFirst({
        where: { testRunId: run.id, errorMessage: { not: null } },
        select: { errorMessage: true },
      });
      errorMessage = failedResult?.errorMessage ?? null;
    }
    if (run) {
      latestRunByTestCase.set(id, {
        id: run.id,
        status: run.status,
        errorMessage,
        finishedAt: run.finishedAt,
      });
    }
  }

  const failing: FailingTestRecord[] = testCases
    .filter((tc) => failingIds.includes(tc.id))
    .map((tc) => {
      const run = latestRunByTestCase.get(tc.id);
      return {
        id: tc.id,
        title: tc.title,
        priority: tc.priority as TestCasePriority,
        module: tc.module,
        latestRun: run
          ? {
              id: run.id,
              status: run.status as RunStatus,
              errorMessage: run.errorMessage,
              finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
            }
          : null,
      };
    });

  return failing.sort((a, b) => PRIORITY_SEVERITY[b.priority] - PRIORITY_SEVERITY[a.priority]);
}
