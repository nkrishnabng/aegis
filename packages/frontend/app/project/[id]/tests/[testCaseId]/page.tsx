"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  ChangeRequestRecord,
  FlowSummary,
  TestCasePriority,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
  TestDataSetRecord,
  TestRunRecord,
  TestStepRecord,
  UserSummary,
} from "@testingmcp/shared";
import { api } from "../../../../../lib/api";
import { StatusBadge } from "../../../../../components/StatusBadge";
import { StepListEditor, blankStep } from "../../../../../components/StepListEditor";
import { useProjectContext } from "../../../../../lib/ProjectContext";
import { useToast } from "../../../../../components/ToastProvider";
import { ConfirmModal } from "../../../../../components/ConfirmModal";
import { SkeletonBlock } from "../../../../../components/Skeleton";

const TYPES: TestCaseType[] = [
  "smoke",
  "regression",
  "functional",
  "negative",
  "ui",
  "accessibility",
  "edgeCase",
];

export default function TestCaseEditorPage() {
  const params = useParams<{ id: string; testCaseId: string }>();
  const router = useRouter();
  const { project, environmentId } = useProjectContext();
  const { showToast } = useToast();
  const [testCase, setTestCase] = useState<TestCaseRecord | null>(null);
  const [runs, setRuns] = useState<TestRunRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [me, setMe] = useState<UserSummary | null>(null);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [insertingFlow, setInsertingFlow] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRecord[]>([]);
  const [requestingChange, setRequestingChange] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);
  const [dataSet, setDataSet] = useState<TestDataSetRecord | null>(null);
  const [dataText, setDataText] = useState("");
  const [dataFormat, setDataFormat] = useState<"csv" | "json">("csv");
  const [dataError, setDataError] = useState<string | null>(null);
  const [savingData, setSavingData] = useState(false);
  const [runningWithData, setRunningWithData] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [replacingData, setReplacingData] = useState(false);
  const [tagsDraft, setTagsDraft] = useState<string | null>(null);

  function loadChangeRequests() {
    api.listChangeRequests(params.testCaseId).then(setChangeRequests);
  }

  useEffect(() => {
    api.getTestCase(params.testCaseId).then(setTestCase);
    api.listRunsForTestCase(params.testCaseId).then(setRuns);
    api.getTestDataSet(params.testCaseId).then(setDataSet);
    api.listFlows(params.id).then(setFlows);
    loadChangeRequests();
  }, [params.testCaseId, params.id]);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  if (!testCase) return <SkeletonBlock lines={8} />;

  const canEdit = !testCase.createdBy || testCase.createdBy.id === me?.id || me?.role === "admin";
  const openChangeRequests = changeRequests.filter((cr) => cr.status === "open");
  const canReview =
    (project?.myRole === "owner" || project?.myRole === "reviewer") && testCase.createdBy?.id !== me?.id;

  async function handleRequestChange() {
    if (!changeNote.trim()) return;
    setSubmittingChange(true);
    try {
      await api.createChangeRequest(testCase!.id, changeNote.trim());
      showToast("Flagged for the owner to review.");
      setChangeNote("");
      setRequestingChange(false);
      loadChangeRequests();
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setSubmittingChange(false);
    }
  }

  async function handleResolveChange(id: string) {
    try {
      await api.resolveChangeRequest(id);
      showToast("Marked resolved.");
      loadChangeRequests();
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  function update<K extends keyof TestCaseRecord>(key: K, value: TestCaseRecord[K]) {
    setTestCase((tc) => (tc ? { ...tc, [key]: value } : tc));
  }

  async function handleGenerateStep() {
    if (!instruction.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const generated = await api.generateStep(testCase!.id, instruction);
      setTestCase((tc) => {
        if (!tc) return tc;
        const nextOrder = tc.steps.length ? Math.max(...tc.steps.map((s) => s.order)) + 1 : 1;
        const newStep: TestStepRecord = { ...blankStep(nextOrder), testCaseId: tc.id, ...generated, order: nextOrder };
        return { ...tc, steps: [...tc.steps, newStep] };
      });
      setInstruction("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleInsertFlow(flowId: string) {
    setInsertingFlow(true);
    setError(null);
    try {
      const flow = await api.getFlow(flowId);
      const latest = flow.versions[flow.versions.length - 1];
      const updated = await api.insertFlowIntoTestCase(testCase!.id, latest.id);
      setTestCase(updated);
      showToast(`Inserted "${flow.name}" (v${latest.version}).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInsertingFlow(false);
    }
  }

  async function handleUpdateFlowBlock(flowId: string, sourceFlowVersionId: string) {
    setError(null);
    try {
      const flow = await api.getFlow(flowId);
      const latest = flow.versions[flow.versions.length - 1];
      const updated = await api.updateFlowBlock(testCase!.id, sourceFlowVersionId, latest.id);
      setTestCase(updated);
      showToast(`Updated to "${flow.name}" v${latest.version}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSave() {
    if (!testCase) return;
    setSaving(true);
    setError(null);
    try {
      const steps = testCase.steps.slice().sort((a, b) => a.order - b.order);
      const updated = await api.updateTestCase(testCase.id, {
        title: testCase.title,
        objective: testCase.objective,
        preconditions: testCase.preconditions,
        testData: testCase.testData,
        expectedResult: testCase.expectedResult,
        priority: testCase.priority,
        type: testCase.type,
        module: testCase.module,
        tags: testCase.tags,
        status: testCase.status,
        steps: steps.map((s, i) => ({
          order: i + 1,
          action: s.action,
          selector: s.selector,
          locatorCandidates: s.locatorCandidates,
          value: s.value,
          description: s.description,
          enabled: s.enabled,
          sourceFlowVersionId: s.sourceFlow?.versionId ?? null,
        })),
      });
      setTestCase(updated);
      showToast("Test case saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await api.deleteTestCase(testCase!.id);
    router.push(`/project/${params.id}`);
  }

  async function handleReview(decision: "approve" | "reject") {
    setReviewing(true);
    setError(null);
    try {
      const updated = await api.reviewTestCase(testCase!.id, decision);
      setTestCase(updated);
      showToast(decision === "approve" ? "Test case approved." : "Test case sent back to draft.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const run = await api.runTestCase(testCase!.id, environmentId || undefined);
      router.push(`/project/${params.id}/runs/${run.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function handleUploadDataSet() {
    if (!dataText.trim()) return;
    setSavingData(true);
    setDataError(null);
    try {
      const saved = await api.uploadTestDataSet(testCase!.id, dataText, dataFormat, dataSet?.secretColumns ?? []);
      setDataSet(saved);
      setDataText("");
      setReplacingData(false);
      showToast(`Saved test data (${saved.rows.length} row(s)).`);
    } catch (err) {
      setDataError((err as Error).message);
    } finally {
      setSavingData(false);
    }
  }

  async function handleToggleSecretColumn(column: string, secret: boolean) {
    if (!dataSet) return;
    const next = secret
      ? [...dataSet.secretColumns, column]
      : dataSet.secretColumns.filter((c) => c !== column);
    const updated = await api.updateDataSetSecretColumns(testCase!.id, next);
    setDataSet(updated);
  }

  async function handleDeleteDataSet() {
    await api.deleteTestDataSet(testCase!.id);
    setDataSet(null);
  }

  async function handleRunWithData() {
    setRunningWithData(true);
    setError(null);
    try {
      const result = await api.runTestCaseWithData(testCase!.id, environmentId || undefined);
      showToast(`Started ${result.testRunIds.length} data-driven run(s).`);
      api.listRunsForTestCase(params.testCaseId).then(setRuns);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningWithData(false);
    }
  }

  return (
    <div>
      <div className="toolbar" style={{ alignItems: "center" }}>
        {canEdit ? (
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        ) : (
          <button className="btn primary" onClick={() => setRequestingChange(true)}>
            Request changes
          </button>
        )}
        <button className="btn" onClick={handleRun} disabled={running}>
          {running ? "Running..." : "Run"}
        </button>
        {dataSet && dataSet.rows.length > 0 && (
          <button className="btn" onClick={handleRunWithData} disabled={runningWithData}>
            {runningWithData ? "Starting..." : `Run with data (${dataSet.rows.length})`}
          </button>
        )}
        <a className="btn" href={api.exportUrl(testCase.id)}>
          Export as Playwright script
        </a>
        {canEdit && (
          <button className="btn danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
        {canReview && testCase.status !== "approved" && (
          <button className="btn primary" onClick={() => handleReview("approve")} disabled={reviewing}>
            {reviewing ? "Approving..." : "Approve"}
          </button>
        )}
        {canReview && testCase.status === "approved" && (
          <button className="btn" onClick={() => handleReview("reject")} disabled={reviewing}>
            {reviewing ? "Rejecting..." : "Reject (send back to draft)"}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span className="muted">
          Owner: {testCase.createdBy?.username ?? "unowned (anyone can edit)"} · v{testCase.version}
          {testCase.lastModifiedBy && ` · last edited by ${testCase.lastModifiedBy.username}`}
        </span>
        {!canEdit && <span className="badge">view only</span>}
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {openChangeRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--warning)" }}>
          <h2 className="section-title">Open change requests</h2>
          {openChangeRequests.map((cr) => (
            <div key={cr.id} className="list-item" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="muted">
                  {cr.requestedBy.username} · {new Date(cr.createdAt).toLocaleString()}
                </div>
                <div>{cr.note}</div>
              </div>
              {canEdit && (
                <button className="btn" onClick={() => handleResolveChange(cr.id)}>
                  Mark resolved
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {testCase.sourcePrompt && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title">Generated from</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 0, whiteSpace: "pre-wrap" }}>
            {testCase.sourcePrompt}
          </p>
          <p className="muted" style={{ fontSize: "0.72rem", marginTop: 8, marginBottom: 0 }}>
            The original prompt that produced this test case -- shared with anyone who can see this
            project, even though the chat conversation itself is private to whoever wrote it.
          </p>
        </div>
      )}

      <div
        style={{ pointerEvents: canEdit ? undefined : "none", opacity: canEdit ? 1 : 0.7 }}
        title={canEdit ? undefined : "View only — use Request changes to flag an issue for the owner"}
      >
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Details</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <label>
            Title
            <input value={testCase.title} onChange={(e) => update("title", e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            Objective
            <input
              value={testCase.objective}
              onChange={(e) => update("objective", e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Preconditions
            <input
              value={testCase.preconditions}
              onChange={(e) => update("preconditions", e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Expected result
            <input
              value={testCase.expectedResult}
              onChange={(e) => update("expectedResult", e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Test data (JSON)
            <textarea
              value={JSON.stringify(testCase.testData, null, 2)}
              rows={4}
              style={{ width: "100%", fontFamily: "ui-monospace, monospace" }}
              onChange={(e) => {
                try {
                  update("testData", JSON.parse(e.target.value));
                } catch {
                  // ignore invalid JSON while typing
                }
              }}
            />
          </label>
          <div style={{ display: "flex", gap: 16 }}>
            <label>
              Priority
              <select
                value={testCase.priority}
                onChange={(e) => update("priority", e.target.value as TestCasePriority)}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <label>
              Type
              <select value={testCase.type} onChange={(e) => update("type", e.target.value as TestCaseType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={testCase.status}
                onChange={(e) => update("status", e.target.value as TestCaseStatus)}
              >
                <option value="draft">draft</option>
                <option value="approved" disabled={testCase.status !== "approved"}>
                  approved{testCase.status !== "approved" && " (use Approve above)"}
                </option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label>
              Module
              <input
                placeholder="e.g. Authentication (used for dashboard coverage-by-module)"
                value={testCase.module ?? ""}
                onChange={(e) => update("module", e.target.value || null)}
                style={{ width: 260 }}
              />
            </label>
            <label>
              Tags
              <input
                placeholder="comma-separated, e.g. checkout, smoke"
                value={tagsDraft ?? testCase.tags.join(", ")}
                onChange={(e) => setTagsDraft(e.target.value)}
                onBlur={() => {
                  if (tagsDraft === null) return;
                  update(
                    "tags",
                    tagsDraft
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  );
                  setTagsDraft(null);
                }}
                style={{ width: 260 }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="section-title">Test data</h2>
          {dataSet && (
            <button className="btn danger" onClick={handleDeleteDataSet}>
              Delete data set
            </button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85em" }}>
          Upload a CSV or JSON array to run this test case once per row. Reference a column in any
          step&apos;s value with <code>{"{{data.COLUMN}}"}</code>, the same way <code>{"{{env.KEY}}"}</code>{" "}
          references environment credentials. Mark a column secret to keep its values out of run
          results/logs and exported specs (sourced from an env var instead).
        </p>

        {dataSet && !replacingData ? (
          <>
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {dataSet.columns.map((col) => (
                      <th key={col}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: "normal" }}>
                          <input
                            type="checkbox"
                            checked={dataSet.secretColumns.includes(col)}
                            onChange={(e) => handleToggleSecretColumn(col, e.target.checked)}
                          />
                          {col} {dataSet.secretColumns.includes(col) && <span className="badge">secret</span>}
                        </label>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataSet.rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {dataSet.columns.map((col) => (
                        <td key={col}>{dataSet.secretColumns.includes(col) ? "••••••" : row[col]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {dataSet.rows.length > 10 && (
                <p className="muted" style={{ fontSize: "0.8em" }}>
                  + {dataSet.rows.length - 10} more row(s) not shown.
                </p>
              )}
            </div>
            <button className="btn" onClick={() => setReplacingData(true)}>
              Replace data
            </button>
          </>
        ) : (
          <>
            <div className="toolbar" style={{ paddingLeft: 0, marginBottom: 8 }}>
              <select value={dataFormat} onChange={(e) => setDataFormat(e.target.value as "csv" | "json")}>
                <option value="csv">CSV (first row = headers)</option>
                <option value="json">JSON (array of flat objects)</option>
              </select>
            </div>
            <textarea
              value={dataText}
              onChange={(e) => setDataText(e.target.value)}
              rows={6}
              placeholder={
                dataFormat === "csv"
                  ? "username,password\ntomsmith,SuperSecretPassword!"
                  : '[{"username":"tomsmith","password":"SuperSecretPassword!"}]'
              }
              style={{ width: "100%", fontFamily: "ui-monospace, monospace", marginBottom: 8 }}
            />
            {dataError && <p style={{ color: "var(--danger)" }}>{dataError}</p>}
            <div className="toolbar" style={{ paddingLeft: 0 }}>
              <button className="btn primary" onClick={handleUploadDataSet} disabled={savingData || !dataText.trim()}>
                {savingData ? "Parsing..." : "Parse & save"}
              </button>
              {dataSet && (
                <button className="btn" onClick={() => setReplacingData(false)}>
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="section-title">Steps</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) handleInsertFlow(e.target.value);
              }}
              disabled={insertingFlow || flows.length === 0}
            >
              <option value="">{insertingFlow ? "Inserting..." : "+ Insert flow..."}</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (v{f.latestVersion}, {f.latestStepCount} steps)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
          <input
            placeholder="Quick-add a step from an instruction, e.g. 'check the remember-me checkbox'"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={handleGenerateStep} disabled={generating || !instruction.trim()}>
            {generating ? "Generating..." : "Generate step"}
          </button>
        </div>

        <StepListEditor
          steps={testCase.steps}
          onChange={(steps) => update("steps", steps)}
          renderStepExtra={(step) =>
            step.sourceFlow ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <span className="badge" title={`Inserted from this flow's v${step.sourceFlow.version}`}>
                  from flow &quot;{step.sourceFlow.flowName}&quot; v{step.sourceFlow.version}
                </span>
                {!step.sourceFlow.isLatest && (
                  <button
                    className="btn"
                    style={{ fontSize: "0.8em", padding: "2px 8px", marginLeft: 8 }}
                    onClick={() => handleUpdateFlowBlock(step.sourceFlow!.flowId, step.sourceFlow!.versionId)}
                  >
                    Update to latest
                  </button>
                )}
              </div>
            ) : null
          }
        />
      </div>
      </div>

      <div className="card">
        <h2 className="section-title">Past runs</h2>
        {runs.length === 0 && <p className="muted">No runs yet.</p>}
        {runs.map((run) => (
          <a key={run.id} className="list-item" href={`/project/${params.id}/runs/${run.id}`}>
            <span>
              {new Date(run.startedAt).toLocaleString()}
              {run.dataRowIndex !== null && <span className="muted"> · data row {run.dataRowIndex}</span>}
            </span>
            <StatusBadge status={run.status} />
          </a>
        ))}
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete test case?"
          message="This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {requestingChange && (
        <div className="modal-overlay" onClick={() => setRequestingChange(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Request changes</h3>
            <p className="muted">
              This flags the issue for {testCase.createdBy?.username ?? "the owner"} to review and
              update the test case.
            </p>
            <textarea
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              rows={4}
              placeholder="What's wrong or what should change?"
              style={{ width: "100%" }}
              autoFocus
            />
            <div className="toolbar" style={{ paddingLeft: 0, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setRequestingChange(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={handleRequestChange}
                disabled={submittingChange || !changeNote.trim()}
              >
                {submittingChange ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
