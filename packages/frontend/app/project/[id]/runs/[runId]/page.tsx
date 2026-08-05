"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { IntegrationType, RunStatus, ServerToClientMessage, TestRunRecord } from "@testingmcp/shared";
import { api } from "../../../../../lib/api";
import { StatusBadge } from "../../../../../components/StatusBadge";
import { SkeletonBlock } from "../../../../../components/Skeleton";
import { useToast } from "../../../../../components/ToastProvider";
import { useProjectSocket } from "../../../../../lib/useProjectSocket";
import { formatElapsed, useTick } from "../../../../../lib/useElapsedTime";

type Tab = "steps" | "console" | "network" | "trace";

const TRACKER_LABELS: Record<IntegrationType, string> = {
  jira: "Jira",
  githubIssues: "GitHub Issues",
  azureDevOps: "Azure DevOps",
};

const LIVE_STATUSES: RunStatus[] = ["pending", "running"];

export default function RunDashboardPage() {
  const params = useParams<{ id: string; runId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [run, setRun] = useState<TestRunRecord | null>(null);
  const [configuredTrackers, setConfiguredTrackers] = useState<IntegrationType[]>([]);
  const [rerunning, setRerunning] = useState(false);
  const [resumingStepOrder, setResumingStepOrder] = useState<number | null>(null);
  const [pushingTo, setPushingTo] = useState<IntegrationType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("steps");

  useEffect(() => {
    api.getTestRun(params.runId).then(setRun);
    api.getIntegrations(params.id).then((integrations) => {
      setConfiguredTrackers(
        (Object.keys(integrations) as IntegrationType[]).filter((type) => integrations[type]),
      );
    });
  }, [params.runId, params.id]);

  // Live updates while this run is still going -- without this, a run
  // started from another page lands here frozen at "pending" until the user
  // manually refreshes, since the initial fetch above only ever runs once.
  const onMessage = useCallback(
    (event: ServerToClientMessage) => {
      if (event.type === "run.progress" && event.testRunId === params.runId) {
        setRun((prev) => {
          if (!prev) return prev;
          const results = prev.results.map((r) =>
            r.stepOrder === event.stepOrder ? { ...r, status: event.status } : r,
          );
          return { ...prev, status: "running", results };
        });
      } else if (event.type === "run.completed" && event.testRun.id === params.runId) {
        setRun(event.testRun);
        showToast(`Run ${event.testRun.status}.`);
      } else if (event.type === "healing.detected") {
        showToast("Self-healing suggestion available for this run's selector.");
      }
    },
    [params.runId, showToast],
  );
  useProjectSocket(params.id, onMessage);

  const isLive = !!run && LIVE_STATUSES.includes(run.status);
  useTick(isLive);

  async function handleRerun() {
    setRerunning(true);
    setError(null);
    try {
      const newRun = await api.rerunTestRun(params.runId);
      router.push(`/project/${params.id}/runs/${newRun.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRerunning(false);
    }
  }

  async function handleRerunFromStep(stepOrder: number) {
    setResumingStepOrder(stepOrder);
    setError(null);
    try {
      const newRun = await api.rerunTestRun(params.runId, stepOrder);
      router.push(`/project/${params.id}/runs/${newRun.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResumingStepOrder(null);
    }
  }

  async function handlePushToTracker(type: IntegrationType) {
    setPushingTo(type);
    setError(null);
    try {
      const push = await api.pushRunToTracker(params.runId, type);
      setRun((prev) =>
        prev ? { ...prev, issuePushes: [push, ...prev.issuePushes.filter((p) => p.type !== type)] } : prev,
      );
      if (push.status === "pushed") {
        showToast(`Pushed to ${TRACKER_LABELS[type]}.`);
      } else {
        setError(push.errorMessage ?? `Failed to push to ${TRACKER_LABELS[type]}.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPushingTo(null);
    }
  }

  if (!run) return <SkeletonBlock lines={6} />;

  const hasFailure = run.status === "failed" || run.status === "error";
  const executionLogs = run.logs.filter((l) => l.category === "execution");
  const consoleLogs = run.logs.filter((l) => l.category === "console");
  const networkLogs = run.logs.filter((l) => l.category === "network");
  const allScreenshots = run.results.flatMap((r) => r.screenshots.map((s) => ({ ...s, stepOrder: r.stepOrder })));

  return (
    <div>
      <div className="toolbar">
        <StatusBadge status={run.status} />
        {isLive && (
          <span className="muted" style={{ fontSize: "0.8em" }}>
            {formatElapsed(Date.now() - new Date(run.startedAt).getTime())} elapsed &middot;{" "}
            {run.results.length} step(s) so far
          </span>
        )}
        {run.continuedFromChat && <span className="badge">continued from chat session</span>}
        {run.resumedFromRunId && (
          <span className="badge">resumed from step {run.resumedFromStepOrder}</span>
        )}
        {run.dataRowIndex !== null && <span className="badge">data row {run.dataRowIndex}</span>}
        {hasFailure && (
          <button className="btn primary" onClick={handleRerun} disabled={rerunning}>
            {rerunning ? "Rerunning..." : "Rerun test"}
          </button>
        )}
        {hasFailure &&
          configuredTrackers.map((type) => {
            const push = run.issuePushes.find((p) => p.type === type);
            if (push?.status === "pushed" && push.issueUrl) {
              return (
                <a key={type} className="btn" href={push.issueUrl} target="_blank" rel="noreferrer">
                  View in {TRACKER_LABELS[type]} ↗
                </a>
              );
            }
            return (
              <button
                key={type}
                className="btn"
                onClick={() => handlePushToTracker(type)}
                disabled={pushingTo !== null}
              >
                {pushingTo === type ? "Pushing..." : `Push to ${TRACKER_LABELS[type]}`}
              </button>
            );
          })}
        <span className="muted">
          Started {new Date(run.startedAt).toLocaleString()}
          {run.finishedAt && ` · Finished ${new Date(run.finishedAt).toLocaleString()}`}
        </span>
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="toolbar" style={{ paddingLeft: 0 }}>
        {(["steps", "console", "network", "trace"] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "btn primary" : "btn"}
            onClick={() => setTab(t)}
            style={{ textTransform: "capitalize" }}
          >
            {t}
            {t === "console" && consoleLogs.length > 0 ? ` (${consoleLogs.length})` : ""}
            {t === "network" && networkLogs.length > 0 ? ` (${networkLogs.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "steps" && (
        <>
          {run.resumedFromRunId && run.inheritedResults.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h2 className="section-title">Inherited steps</h2>
              <p className="muted" style={{ fontSize: "0.85em" }}>
                Steps before {run.resumedFromStepOrder} were not re-executed this run -- their
                outcome is inherited from{" "}
                <a href={`/project/${params.id}/runs/${run.resumedFromRunId}`} style={{ color: "var(--accent)" }}>
                  run {run.resumedFromRunId.slice(-8)}
                </a>{" "}
                and not re-verified here.
              </p>
              {run.inheritedResults.map((result) => (
                <div key={result.id} className="card" style={{ marginBottom: 10, opacity: 0.7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>Step {result.stepOrder} (inherited)</strong>
                    <StatusBadge status={result.status} />
                  </div>
                  {result.actualResult && <p className="muted">{result.actualResult}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="section-title">Steps</h2>
            {run.results.map((result) => (
              <div key={result.id} className="card" style={{ marginBottom: 10, background: "var(--surface-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Step {result.stepOrder}</strong>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {result.recovered && (
                      <a className="badge" href={`/project/${params.id}/healing`} title="Review this selector recovery">
                        selector auto-recovered ↗
                      </a>
                    )}
                    {result.action === "assertVisualMatch" && result.status === "failed" && (
                      <a
                        className="badge failed"
                        href={`/project/${params.id}/visual-regression`}
                        title="Review this visual diff"
                      >
                        visual diff — review ↗
                      </a>
                    )}
                    <StatusBadge status={result.status} />
                    <span className="muted">{result.durationMs}ms</span>
                    {(result.status === "passed" || result.status === "failed") && result.stepOrder > 1 && (
                      <button
                        className="btn"
                        style={{ fontSize: "0.8em", padding: "2px 8px" }}
                        onClick={() => handleRerunFromStep(result.stepOrder)}
                        disabled={resumingStepOrder !== null}
                        title="Restore the state captured after the previous step and re-run from here"
                      >
                        {resumingStepOrder === result.stepOrder ? "Starting..." : "↻ rerun from here"}
                      </button>
                    )}
                  </div>
                </div>
                {result.actualResult && <p className="muted">{result.actualResult}</p>}
                {result.errorMessage && (
                  <p style={{ color: "var(--danger)", whiteSpace: "pre-wrap" }}>{result.errorMessage}</p>
                )}
                {result.suggestedFix && (
                  <p style={{ color: "var(--warning)" }}>
                    <strong>Suggested fix:</strong> {result.suggestedFix}
                  </p>
                )}
                {result.screenshots.length > 0 && (
                  <div className="screenshot-grid" style={{ marginTop: 8 }}>
                    {result.screenshots.map((s) => (
                      <a key={s.id} href={api.screenshotUrl(s.filePath)} target="_blank" rel="noreferrer">
                        <img src={api.screenshotUrl(s.filePath)} alt={`Step ${s.stepOrder} screenshot`} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="card">
            <h2 className="section-title">Execution logs</h2>
            {executionLogs.length === 0 && <p className="muted">No execution log entries.</p>}
            {executionLogs.map((log) => (
              <div key={log.id} className={`log-line ${log.level}`}>
                [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "console" && (
        <div className="card">
          <h2 className="section-title">Browser console</h2>
          {consoleLogs.length === 0 && <p className="muted">No console messages captured.</p>}
          {consoleLogs.map((log) => (
            <pre key={log.id} className="log-line info" style={{ whiteSpace: "pre-wrap" }}>
              {log.message}
            </pre>
          ))}
        </div>
      )}

      {tab === "network" && (
        <div className="card">
          <h2 className="section-title">Network requests</h2>
          {networkLogs.length === 0 && <p className="muted">No network requests captured.</p>}
          {networkLogs.map((log) => (
            <pre key={log.id} className="log-line info" style={{ whiteSpace: "pre-wrap" }}>
              {log.message}
            </pre>
          ))}
        </div>
      )}

      {tab === "trace" && (
        <div className="card">
          {(run.tracePath || run.videoPath) && (
            <div className="card" style={{ marginBottom: 16, background: "var(--surface-2)" }}>
              <h2 className="section-title">Recorded trace &amp; video</h2>
              <div style={{ display: "flex", gap: 8, marginBottom: run.videoPath ? 12 : 0 }}>
                {run.tracePath && (
                  <a className="btn" href={api.artifactUrl(run.tracePath)} download>
                    Download trace (.trace)
                  </a>
                )}
              </div>
              {run.tracePath && (
                <p className="muted" style={{ fontSize: "0.85em" }}>
                  Open with <code>npx playwright show-trace &lt;downloaded file&gt;</code>.
                </p>
              )}
              {run.videoPath && (
                <video controls style={{ width: "100%", maxWidth: 640, borderRadius: 8 }}>
                  <source src={api.artifactUrl(run.videoPath)} type="video/webm" />
                </video>
              )}
            </div>
          )}
          <h2 className="section-title">Trace timeline</h2>
          <p className="muted" style={{ fontSize: "0.85em" }}>
            {run.tracePath || run.videoPath
              ? "A structured reconstruction from step results, screenshots, and console/network logs, alongside the real recording above."
              : "No trace/video was captured for this run (Playwright MCP's devtools capability may be unavailable) -- this is a structured reconstruction from step results, screenshots, and console/network logs."}
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {run.results.map((r) => (
                <tr key={r.id}>
                  <td>{r.stepOrder}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.durationMs}ms</td>
                  <td>{r.actualResult ?? r.errorMessage ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allScreenshots.length > 0 && (
            <div className="screenshot-grid" style={{ marginTop: 16 }}>
              {allScreenshots.map((s) => (
                <a key={s.id} href={api.screenshotUrl(s.filePath)} target="_blank" rel="noreferrer">
                  <img src={api.screenshotUrl(s.filePath)} alt={`Step ${s.stepOrder} screenshot`} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
