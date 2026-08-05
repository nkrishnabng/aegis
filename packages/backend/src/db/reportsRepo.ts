import type { ReportsDayPoint, RunStatus } from "@testingmcp/shared";
import { prisma } from "./client";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Groups every run in the last `days` days by calendar day -- a real
 * aggregation over existing TestRun rows, no new tables. */
export async function getRunsTimeSeries(projectId: string, days = 30): Promise<ReportsDayPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const runs = await prisma.testRun.findMany({
    where: { testCase: { projectId }, startedAt: { gte: since } },
    select: { status: true, startedAt: true, finishedAt: true },
    orderBy: { startedAt: "asc" },
  });

  const byDay = new Map<string, { passed: number; failed: number; skipped: number; durations: number[] }>();
  for (const run of runs) {
    const key = dayKey(run.startedAt);
    const bucket = byDay.get(key) ?? { passed: 0, failed: 0, skipped: 0, durations: [] };
    const status = run.status as RunStatus;
    if (status === "passed") bucket.passed++;
    else if (status === "failed" || status === "error") bucket.failed++;
    else if (status === "skipped") bucket.skipped++;
    if (run.finishedAt) {
      bucket.durations.push(Math.max(0, run.finishedAt.getTime() - run.startedAt.getTime()));
    }
    byDay.set(key, bucket);
  }

  // Fill in every day in the window (not just days with runs) so the chart
  // has a continuous x-axis instead of gaps.
  const points: ReportsDayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    const bucket = byDay.get(date);
    const avgDurationMs = bucket && bucket.durations.length > 0
      ? Math.round(bucket.durations.reduce((sum, d) => sum + d, 0) / bucket.durations.length)
      : 0;
    points.push({
      date,
      passed: bucket?.passed ?? 0,
      failed: bucket?.failed ?? 0,
      skipped: bucket?.skipped ?? 0,
      avgDurationMs,
    });
  }
  return points;
}
