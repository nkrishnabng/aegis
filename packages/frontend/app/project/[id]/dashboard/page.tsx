"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { DashboardSummary, ProjectRecord, TestCaseRecord } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { StatusBadge } from "../../../../components/StatusBadge";
import { SkeletonBlock } from "../../../../components/Skeleton";
import { EmptyState } from "../../../../components/EmptyState";
import { useToast } from "../../../../components/ToastProvider";
import { Gauge } from "../../../../components/Gauge";
import { InfoButton, InfoModal } from "../../../../components/InfoModal";

const PAGE_SIZE = 10;

const TYPE_COLORS: Record<string, string> = {
  smoke: "#3b82f6",
  regression: "#8b5cf6",
  functional: "#22c55e",
  negative: "#ef4444",
  ui: "#eab308",
  accessibility: "#06b6d4",
  edgeCase: "#f97316",
};

const ACTIVITY_ICONS: Record<string, string> = {
  generated: "✨",
  run_completed: "🏁",
  healed: "🩹",
  change_requested: "🚩",
};

function gaugeColor(value: number): string {
  if (value >= 80) return "var(--success)";
  if (value >= 50) return "var(--warning)";
  return "var(--danger)";
}

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [testCases, setTestCases] = useState<TestCaseRecord[] | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [page, setPage] = useState(0);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [infoModal, setInfoModal] = useState<"health" | "readiness" | "coverage" | null>(null);

  function load() {
    api.getDashboard(params.id).then(setSummary);
    api.listTestCases(params.id).then(setTestCases);
  }

  useEffect(load, [params.id]);
  useEffect(() => {
    api.listProjects().then(setProjects);
  }, []);

  const totalPages = testCases ? Math.max(1, Math.ceil(testCases.length / PAGE_SIZE)) : 1;
  const pageItems = useMemo(
    () => (testCases ?? []).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [testCases, page],
  );

  async function handleRun(testCaseId: string) {
    setRunningIds((prev) => new Set(prev).add(testCaseId));
    try {
      const run = await api.runTestCase(testCaseId);
      router.push(`/project/${params.id}/runs/${run.id}`);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(testCaseId);
        return next;
      });
    }
  }

  async function handleResolve(changeRequestId: string) {
    try {
      await api.resolveChangeRequest(changeRequestId);
      showToast("Marked as resolved.");
      load();
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  if (!summary) return <SkeletonBlock lines={6} />;

  const maxTypeCount = Math.max(1, ...Object.values(summary.testCasesByType));
  const runTotal = summary.passCount + summary.failCount + summary.skipCount;

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Executive Dashboard</h1>
        {projects && projects.length > 1 && (
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="muted">Project</span>
            <select
              value={params.id}
              onChange={(e) => router.push(`/project/${e.target.value}/dashboard`)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="hero-grid">
        <div className="hero-card">
          <InfoButton label="How Test Health is calculated" onClick={() => setInfoModal("health")} />
          <Gauge value={summary.testHealthScore} label="Test Health" color={gaugeColor(summary.testHealthScore)} />
          {summary.trend.testHealthDelta !== null && summary.trend.testHealthDelta !== 0 && (
            <span className={`trend-delta ${summary.trend.testHealthDelta > 0 ? "up" : "down"}`}>
              {summary.trend.testHealthDelta > 0 ? "+" : ""}
              {summary.trend.testHealthDelta} vs previous {summary.recentRuns.length} runs
            </span>
          )}
        </div>
        <div className="hero-card">
          <InfoButton label="How Release Readiness is calculated" onClick={() => setInfoModal("readiness")} />
          <Gauge
            value={summary.releaseReadinessScore}
            label="Release Readiness"
            color={gaugeColor(summary.releaseReadinessScore)}
          />
          <div className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
            {summary.failingTests.length} failing approved test(s)
          </div>
        </div>
        <div className="hero-card">
          <InfoButton label="How Automation Coverage is calculated" onClick={() => setInfoModal("coverage")} />
          <Gauge
            value={summary.automationCoveragePercent}
            label="Automation Coverage"
            color={gaugeColor(summary.automationCoveragePercent)}
          />
          <div className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
            {summary.testCasesByStatus.approved ?? 0} of {summary.totalTestCases} approved
          </div>
        </div>
      </div>

      {infoModal === "health" && (
        <InfoModal title="Test Health" onClose={() => setInfoModal(null)}>
          <p>
            <code>score = passRate × 0.7 + (1 − flakyRatio) × 0.3</code>, over the last {summary.recentRuns.length}{" "}
            runs across all test cases in this project.
          </p>
          <p>
            <strong>Pass rate</strong> is the share of those runs that passed. <strong>Flaky ratio</strong> is the
            share of test cases whose last 5 runs contain both a pass and a fail/error. The result is rounded to a
            0–100 score.
          </p>
        </InfoModal>
      )}
      {infoModal === "readiness" && (
        <InfoModal title="Release Readiness" onClose={() => setInfoModal(null)}>
          <p>
            <code>score = (passing approved tests ÷ approved tests) × 100 − (flaky approved tests × 5)</code>,
            floored at 0.
          </p>
          <p>
            Only <strong>approved</strong> test cases count. A test counts as "passing" if its most recent run
            passed. Each flaky approved test (last 5 runs contain both a pass and a fail/error) subtracts 5 points.
            Shows 0 if there are no approved test cases yet.
          </p>
        </InfoModal>
      )}
      {infoModal === "coverage" && (
        <InfoModal title="Automation Coverage" onClose={() => setInfoModal(null)}>
          <p>
            <code>coverage = (approved test cases ÷ total test cases) × 100</code>, rounded to the nearest whole
            percent.
          </p>
          <p>Shows 0 if the project has no test cases yet.</p>
        </InfoModal>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Test Run Summary</h2>
        {runTotal === 0 ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <div className="run-summary-bar">
            <span style={{ width: `${(summary.passCount / runTotal) * 100}%`, background: "var(--success)" }} />
            <span style={{ width: `${(summary.failCount / runTotal) * 100}%`, background: "var(--danger)" }} />
            <span style={{ width: `${(summary.skipCount / runTotal) * 100}%`, background: "var(--text-dim)" }} />
          </div>
        )}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <span className="badge passed">passed</span> <strong>{summary.passCount}</strong>
          </div>
          <div>
            <span className="badge failed">failed</span> <strong>{summary.failCount}</strong>
          </div>
          <div>
            <span className="badge">flaky</span> <strong>{summary.flakyTestCaseIds.length}</strong>
          </div>
          <div>
            <span className="badge skipped">skipped</span> <strong>{summary.skipCount}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              Avg duration
            </div>
            <strong>{(summary.averageDurationMs / 1000).toFixed(1)}s</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              Auto-healed locators
            </div>
            <strong style={{ color: "var(--accent-2)" }}>{summary.healedLocatorCount}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              Max parallel workers
            </div>
            <strong>{summary.maxParallelRuns}</strong>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h2 className="section-title">Recent Activity</h2>
          {summary.recentActivity.length === 0 && <p className="muted">Nothing yet.</p>}
          {summary.recentActivity.map((item, i) => (
            <div className="activity-item" key={i}>
              <div className="activity-icon" style={{ background: "var(--surface-2)" }}>
                {ACTIVITY_ICONS[item.kind] ?? "•"}
              </div>
              <div style={{ minWidth: 0 }}>
                {item.href ? (
                  <a href={item.href}>
                    <strong>{item.message}</strong>
                  </a>
                ) : (
                  <strong>{item.message}</strong>
                )}
                {item.detail && <div className="muted">{item.detail}</div>}
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="section-title">Failing Tests by Priority</h2>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            {(["critical", "high", "medium", "low"] as const).map((p) => (
              <div key={p} className="metric-card" style={{ flex: "1 1 80px", padding: 12 }}>
                <div className="muted" style={{ fontSize: "0.7rem", textTransform: "capitalize" }}>
                  {p}
                </div>
                <div
                  className="value"
                  style={{
                    fontSize: "1.3rem",
                    color: summary.failingTestsByPriority[p] > 0 ? "var(--danger)" : undefined,
                  }}
                >
                  {summary.failingTestsByPriority[p]}
                </div>
              </div>
            ))}
          </div>
          {summary.failingTests.length === 0 && <p className="muted">No failing tests right now.</p>}
          {summary.failingTests.map((tc) => (
            <a key={tc.id} className="list-item" href={`/project/${params.id}/tests/${tc.id}`}>
              <span>{tc.title}</span>
              <span className="badge failed">{tc.priority}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Coverage by Module</h2>
        {summary.coverageByModule.length === 0 && <p className="muted">No test cases yet.</p>}
        <div className="type-breakdown">
          {summary.coverageByModule.map((m) => (
            <div key={m.module} className="type-breakdown-row">
              <span className="type-breakdown-label">{m.module}</span>
              <div className="type-breakdown-track">
                {m.passRate !== null && (
                  <div
                    className="type-breakdown-fill"
                    style={{ width: `${m.passRate}%`, background: gaugeColor(m.passRate) }}
                  />
                )}
              </div>
              <span className="type-breakdown-count">
                {m.passRate !== null ? `${m.passRate}%` : "—"} ({m.testCount})
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Test cases by type</h2>
        {Object.keys(summary.testCasesByType).length === 0 && <p className="muted">No test cases yet.</p>}
        <div className="type-breakdown">
          {Object.entries(summary.testCasesByType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="type-breakdown-row">
                <span className="type-breakdown-label">{type}</span>
                <div className="type-breakdown-track">
                  <div
                    className="type-breakdown-fill"
                    style={{
                      width: `${(count / maxTypeCount) * 100}%`,
                      background: TYPE_COLORS[type] ?? "var(--accent)",
                    }}
                  />
                </div>
                <span className="type-breakdown-count">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {summary.openChangeRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title">Open change requests</h2>
          {summary.openChangeRequests.map((cr) => (
            <div key={cr.id} className="list-item" style={{ alignItems: "flex-start" }}>
              <div>
                <a href={`/project/${params.id}/tests/${cr.testCaseId}`}>
                  <strong>{cr.testCaseTitle}</strong>
                </a>
                <div className="muted">
                  Flagged by {cr.requestedBy.username} on {new Date(cr.createdAt).toLocaleDateString()}
                </div>
                <div>{cr.note}</div>
              </div>
              <button className="btn" onClick={() => handleResolve(cr.id)}>
                Mark resolved
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">All test cases</h2>
        {testCases && testCases.length === 0 && (
          <EmptyState icon="📋" title="No test cases yet" description="Ask the agent in chat to generate some." />
        )}
        {testCases && testCases.length > 0 && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Owner</th>
                  <th>Module</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((tc) => (
                  <tr key={tc.id}>
                    <td>
                      <a href={`/project/${params.id}/tests/${tc.id}`}>{tc.title}</a>
                    </td>
                    <td className="muted">{tc.createdBy?.username ?? "—"}</td>
                    <td className="muted">{tc.module ?? "Unassigned"}</td>
                    <td>
                      <StatusBadge status={tc.status} />
                    </td>
                    <td className="muted">{tc.type}</td>
                    <td className="muted">{tc.priority}</td>
                    <td>
                      {tc.openChangeRequestCount > 0 ? (
                        <span className="badge failed">{tc.openChangeRequestCount}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn"
                        disabled={runningIds.has(tc.id)}
                        onClick={() => handleRun(tc.id)}
                      >
                        {runningIds.has(tc.id) ? "Running..." : "Run"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="toolbar" style={{ justifyContent: "flex-end", paddingLeft: 0 }}>
                <span className="muted">
                  Page {page + 1} of {totalPages}
                </span>
                <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </button>
                <button
                  className="btn"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Recent runs</h2>
        {summary.recentRuns.length === 0 && <p className="muted">No runs yet.</p>}
        {summary.recentRuns.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Test case</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summary.recentRuns.map((run) => (
                <tr key={run.id}>
                  <td>{run.testCaseTitle}</td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{(run.durationMs / 1000).toFixed(1)}s</td>
                  <td>
                    <a className="btn" href={`/project/${params.id}/runs/${run.id}`}>
                      View steps ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
