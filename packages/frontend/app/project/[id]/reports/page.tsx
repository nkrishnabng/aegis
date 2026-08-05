"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { DashboardSummary, ReportsSummary } from "@testingmcp/shared";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../../../lib/api";
import { SkeletonBlock } from "../../../../components/Skeleton";

const COLOR_SUCCESS = "#34d399";
const COLOR_DANGER = "#f87171";
const COLOR_WARNING = "#fb923c";
const COLOR_MUTED = "#929cb3";
const COLOR_INFO = "#6c86ad";
const COLOR_BORDER = "#232c42";
const COLOR_SURFACE_2 = "#0f1524";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ReportsPage() {
  const params = useParams<{ id: string }>();
  const [reports, setReports] = useState<ReportsSummary | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    api.getReports(params.id).then(setReports);
    api.getDashboard(params.id).then(setDashboard);
  }, [params.id]);

  if (!reports || !dashboard) return <SkeletonBlock lines={8} />;

  const chartData = reports.timeSeriesDays.map((d) => ({ ...d, label: formatDate(d.date) }));
  const hasAnyRuns = reports.timeSeriesDays.some((d) => d.passed + d.failed + d.skipped > 0);
  const maxTypeCount = Math.max(1, ...Object.values(dashboard.testCasesByType));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Reports &amp; Analytics</h1>
      <p className="muted">Real trends over the last 30 days, computed from actual run history.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Run volume (last 30 days)</h2>
        {!hasAnyRuns ? (
          <p className="muted">No runs in this window yet.</p>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <CartesianGrid stroke={COLOR_BORDER} strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke={COLOR_MUTED} fontSize={11} />
                <YAxis stroke={COLOR_MUTED} fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: COLOR_SURFACE_2, border: `1px solid ${COLOR_BORDER}`, borderRadius: 8 }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="passed"
                  stackId="1"
                  stroke={COLOR_SUCCESS}
                  fill={COLOR_SUCCESS}
                  fillOpacity={0.35}
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stackId="1"
                  stroke={COLOR_DANGER}
                  fill={COLOR_DANGER}
                  fillOpacity={0.35}
                />
                <Area
                  type="monotone"
                  dataKey="skipped"
                  stackId="1"
                  stroke={COLOR_MUTED}
                  fill={COLOR_MUTED}
                  fillOpacity={0.35}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Avg. duration trend</h2>
        {!hasAnyRuns ? (
          <p className="muted">No runs in this window yet.</p>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid stroke={COLOR_BORDER} strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke={COLOR_MUTED} fontSize={11} />
                <YAxis
                  stroke={COLOR_MUTED}
                  fontSize={11}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}s`}
                />
                <Tooltip
                  contentStyle={{ background: COLOR_SURFACE_2, border: `1px solid ${COLOR_BORDER}`, borderRadius: 8 }}
                  formatter={(value) => `${(Number(value) / 1000).toFixed(1)}s`}
                />
                <Line type="monotone" dataKey="avgDurationMs" stroke={COLOR_INFO} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title">Test cases by type</h2>
          {Object.keys(dashboard.testCasesByType).length === 0 && <p className="muted">No test cases yet.</p>}
          <div className="type-breakdown">
            {Object.entries(dashboard.testCasesByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="type-breakdown-row">
                  <span className="type-breakdown-label">{type}</span>
                  <div className="type-breakdown-track">
                    <div
                      className="type-breakdown-fill"
                      style={{ width: `${(count / maxTypeCount) * 100}%`, background: COLOR_INFO }}
                    />
                  </div>
                  <span className="type-breakdown-count">{count}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Coverage by module</h2>
          {dashboard.coverageByModule.length === 0 && <p className="muted">No test cases yet.</p>}
          <div className="type-breakdown">
            {dashboard.coverageByModule.map((m) => (
              <div key={m.module} className="type-breakdown-row">
                <span className="type-breakdown-label">{m.module}</span>
                <div className="type-breakdown-track">
                  {m.passRate !== null && (
                    <div
                      className="type-breakdown-fill"
                      style={{
                        width: `${m.passRate}%`,
                        background: m.passRate >= 80 ? COLOR_SUCCESS : m.passRate >= 50 ? COLOR_WARNING : COLOR_DANGER,
                      }}
                    />
                  )}
                </div>
                <span className="type-breakdown-count">{m.passRate !== null ? `${m.passRate}%` : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
