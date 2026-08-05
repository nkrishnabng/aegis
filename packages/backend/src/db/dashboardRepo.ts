import type { DashboardSummary, ModuleCoverage, RunStatus, TestCasePriority } from "@testingmcp/shared";
import { prisma } from "./client";
import { countOpenChangeRequestsForProject, listOpenChangeRequestsForProject } from "./changeRequestRepo";
import { listRecentActivity } from "./activityRepo";
import { estimateTimeSaved } from "../dashboard/timeSavedEstimate";
import { env } from "../env";

const WINDOW_SIZE = 20;
const FLAKY_LOOKBACK_RUNS = 5;
const RECENT_ACTIVITY_LIMIT = 8;
const FAILING_TESTS_LIMIT = 10;
const PRIORITY_SEVERITY: Record<TestCasePriority, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function summarizeWindow(runs: { status: RunStatus }[]) {
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  for (const run of runs) {
    if (run.status === "passed") passCount++;
    else if (run.status === "failed" || run.status === "error") failCount++;
    else if (run.status === "skipped") skipCount++;
  }
  const passRate = runs.length > 0 ? passCount / runs.length : 0;
  return { passCount, failCount, skipCount, passRate };
}

function computeHealthScore(passRate: number, flakyRatio: number): number {
  const raw = passRate * 0.7 + (1 - flakyRatio) * 0.3;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

/** For each test case, its latest run's status (if it has run at least once) plus
 * whether it's "flaky" (last FLAKY_LOOKBACK_RUNS runs contain both a pass and a
 * fail/error). Shared by the dashboard and the Failing Tests page so both agree
 * on what "currently failing" means. */
export async function getLatestStatusByTestCase(
  testCaseIds: string[],
): Promise<{ latestStatusByTestCase: Map<string, RunStatus>; flakyIds: string[] }> {
  const flakyIds: string[] = [];
  const latestStatusByTestCase = new Map<string, RunStatus>();
  for (const id of testCaseIds) {
    const lastRuns = await prisma.testRun.findMany({
      where: { testCaseId: id },
      orderBy: { startedAt: "desc" },
      take: FLAKY_LOOKBACK_RUNS,
      select: { status: true },
    });
    if (lastRuns[0]) latestStatusByTestCase.set(id, lastRuns[0].status as RunStatus);
    const statuses = new Set(lastRuns.map((r) => r.status));
    if (statuses.has("passed") && (statuses.has("failed") || statuses.has("error"))) {
      flakyIds.push(id);
    }
  }
  return { latestStatusByTestCase, flakyIds };
}

export async function getDashboardSummary(projectId: string): Promise<DashboardSummary> {
  const testCases = await prisma.testCase.findMany({
    where: { projectId },
    select: { id: true, title: true, status: true, type: true, priority: true, module: true },
  });

  const testCasesByStatus: Record<string, number> = {};
  const testCasesByType: Record<string, number> = {};
  for (const tc of testCases) {
    testCasesByStatus[tc.status] = (testCasesByStatus[tc.status] ?? 0) + 1;
    testCasesByType[tc.type] = (testCasesByType[tc.type] ?? 0) + 1;
  }

  // Fetch two windows' worth of runs at once: the first WINDOW_SIZE is "current"
  // (same as the recentRuns this dashboard has always shown), the next
  // WINDOW_SIZE is "previous", used only to compute trend deltas.
  const runRows = await prisma.testRun.findMany({
    where: { testCase: { projectId } },
    include: { testCase: { select: { title: true } } },
    orderBy: { startedAt: "desc" },
    take: WINDOW_SIZE * 2,
  });

  const allRuns = runRows.map((run) => ({
    id: run.id,
    testCaseId: run.testCaseId,
    testCaseTitle: run.testCase.title,
    status: run.status as RunStatus,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    durationMs:
      run.finishedAt && run.startedAt
        ? Math.max(0, run.finishedAt.getTime() - run.startedAt.getTime())
        : 0,
  }));

  const recentRuns = allRuns.slice(0, WINDOW_SIZE);
  const previousWindowRuns = allRuns.slice(WINDOW_SIZE, WINDOW_SIZE * 2);

  const current = summarizeWindow(recentRuns);
  const previous = previousWindowRuns.length > 0 ? summarizeWindow(previousWindowRuns) : null;

  let totalDuration = 0;
  let durationSamples = 0;
  for (const run of recentRuns) {
    if (run.durationMs > 0) {
      totalDuration += run.durationMs;
      durationSamples++;
    }
  }
  const averageDurationMs = durationSamples > 0 ? Math.round(totalDuration / durationSamples) : 0;

  // Flakiness + latest status, computed once over every test case (not just
  // approved ones) so it can feed both the release-readiness penalty (approved
  // subset) and the broader test-health score (all test cases).
  const { latestStatusByTestCase, flakyIds: flakyIdsAll } = await getLatestStatusByTestCase(
    testCases.map((tc) => tc.id),
  );

  const approvedTestCases = testCases.filter((tc) => tc.status === "approved");
  const approvedIds = new Set(approvedTestCases.map((tc) => tc.id));
  const flakyTestCaseIds = flakyIdsAll.filter((id) => approvedIds.has(id));
  const passingLatestCount = approvedTestCases.filter(
    (tc) => latestStatusByTestCase.get(tc.id) === "passed",
  ).length;

  const releaseReadinessScore =
    approvedTestCases.length === 0
      ? 0
      : Math.max(
          0,
          Math.round(
            (passingLatestCount / approvedTestCases.length) * 100 - flakyTestCaseIds.length * 5,
          ),
        );

  const flakyRatioAll = testCases.length > 0 ? flakyIdsAll.length / testCases.length : 0;
  const testHealthScore = computeHealthScore(current.passRate, flakyRatioAll);
  const testHealthDelta = previous
    ? testHealthScore - computeHealthScore(previous.passRate, flakyRatioAll)
    : null;

  const automationCoveragePercent =
    testCases.length > 0 ? Math.round(((testCasesByStatus.approved ?? 0) / testCases.length) * 100) : 0;

  // Failing tests by priority -- our honest substitute for a bug-tracker-style
  // "Open Defects" card, which would need severity/lifecycle data we don't have.
  const failingTestsByPriority: Record<TestCasePriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const failingTests: { id: string; title: string; priority: TestCasePriority }[] = [];
  for (const tc of testCases) {
    const latest = latestStatusByTestCase.get(tc.id);
    if (latest === "failed" || latest === "error") {
      const priority = tc.priority as TestCasePriority;
      failingTestsByPriority[priority]++;
      failingTests.push({ id: tc.id, title: tc.title, priority });
    }
  }
  failingTests.sort((a, b) => PRIORITY_SEVERITY[b.priority] - PRIORITY_SEVERITY[a.priority]);

  // Coverage by module: pass rate among test cases that have run at least
  // once, grouped by the free-text module tag (untagged -> "Unassigned").
  const moduleGroups = new Map<string, { testCount: number; ranCount: number; passedCount: number }>();
  for (const tc of testCases) {
    const moduleName = tc.module?.trim() || "Unassigned";
    const group = moduleGroups.get(moduleName) ?? { testCount: 0, ranCount: 0, passedCount: 0 };
    group.testCount++;
    const latest = latestStatusByTestCase.get(tc.id);
    if (latest) {
      group.ranCount++;
      if (latest === "passed") group.passedCount++;
    }
    moduleGroups.set(moduleName, group);
  }
  const coverageByModule: ModuleCoverage[] = [...moduleGroups.entries()]
    .map(([module, g]) => ({
      module,
      testCount: g.testCount,
      passRate: g.ranCount > 0 ? Math.round((g.passedCount / g.ranCount) * 100) : null,
    }))
    .sort((a, b) => b.testCount - a.testCount);

  // Time saved -- cumulative across every run this project has ever executed,
  // not just the recent window. See timeSavedEstimate.ts for the assumption.
  const allFinishedRuns = await prisma.testRun.findMany({
    where: { testCase: { projectId }, finishedAt: { not: null } },
    select: { startedAt: true, finishedAt: true },
  });
  const totalAutomatedDurationMs = allFinishedRuns.reduce(
    (sum, r) => sum + Math.max(0, r.finishedAt!.getTime() - r.startedAt.getTime()),
    0,
  );
  const { hours: timeSavedHours, usd: timeSavedUsd } = estimateTimeSaved(
    allFinishedRuns.length,
    totalAutomatedDurationMs,
  );

  const healedLocatorCount = await prisma.healingEvent.count({
    where: { testStep: { testCase: { projectId } } },
  });

  const [openChangeRequestCount, openChangeRequests, recentActivity] = await Promise.all([
    countOpenChangeRequestsForProject(projectId),
    listOpenChangeRequestsForProject(projectId, 10),
    listRecentActivity(projectId, RECENT_ACTIVITY_LIMIT),
  ]);

  return {
    totalTestCases: testCases.length,
    testCasesByStatus,
    testCasesByType,
    recentRuns,
    passCount: current.passCount,
    failCount: current.failCount,
    skipCount: current.skipCount,
    flakyTestCaseIds,
    averageDurationMs,
    averageDurationSampleSize: durationSamples,
    releaseReadinessScore,
    openChangeRequestCount,
    openChangeRequests,
    testHealthScore,
    automationCoveragePercent,
    timeSavedHours,
    timeSavedUsd,
    healedLocatorCount,
    maxParallelRuns: env.maxParallelRuns,
    trend: {
      testHealthDelta,
      // No historical snapshot table (deliberately -- see plan notes): these
      // are point-in-time ratios, not derivable from the run-window data we
      // already have, so we don't fabricate a "vs last period" number for them.
      automationCoverageDelta: null,
      releaseReadinessDelta: null,
    },
    failingTestsByPriority,
    failingTests: failingTests.slice(0, FAILING_TESTS_LIMIT),
    coverageByModule,
    recentActivity,
  };
}
