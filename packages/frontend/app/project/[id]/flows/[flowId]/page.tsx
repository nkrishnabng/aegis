"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { FlowRecord, TestStepRecord } from "@testingmcp/shared";
import { api } from "../../../../../lib/api";
import { StepListEditor } from "../../../../../components/StepListEditor";
import { useToast } from "../../../../../components/ToastProvider";
import { ConfirmModal } from "../../../../../components/ConfirmModal";
import { SkeletonBlock } from "../../../../../components/Skeleton";

/** Wraps a version's plain TestStepInput[] into the TestStepRecord shape
 * StepListEditor works with (synthetic ids, no testCaseId -- a flow isn't
 * attached to one). */
function toEditableSteps(steps: FlowRecord["versions"][number]["steps"]): TestStepRecord[] {
  return steps.map((s, i) => ({ ...s, id: `flow-step-${i}-${Date.now()}`, testCaseId: "", enabled: s.enabled ?? true }));
}

export default function FlowEditorPage() {
  const params = useParams<{ id: string; flowId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [flow, setFlow] = useState<FlowRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<TestStepRecord[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    api.getFlow(params.flowId).then((f) => {
      setFlow(f);
      setName(f.name);
      setDescription(f.description ?? "");
      const latest = f.versions[f.versions.length - 1];
      setSteps(toEditableSteps(latest?.steps ?? []));
    });
  }, [params.flowId]);

  if (!flow) return <SkeletonBlock lines={8} />;

  const latest = flow.versions[flow.versions.length - 1];

  async function handleSaveMetadata() {
    setSavingMetadata(true);
    setError(null);
    try {
      const updated = await api.updateFlowMetadata(flow!.id, { name, description: description || null });
      setFlow(updated);
      showToast("Flow details saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingMetadata(false);
    }
  }

  async function handleSaveVersion() {
    setSaving(true);
    setError(null);
    try {
      const orderedSteps = steps
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({
          order: i + 1,
          action: s.action,
          selector: s.selector,
          locatorCandidates: s.locatorCandidates,
          value: s.value,
          description: s.description,
          enabled: s.enabled,
        }));
      await api.createFlowVersion(flow!.id, orderedSteps, note.trim() || null);
      const updated = await api.getFlow(flow!.id);
      setFlow(updated);
      setNote("");
      showToast(`Saved as v${updated.versions[updated.versions.length - 1].version}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await api.deleteFlow(flow!.id);
    router.push(`/project/${params.id}/flows`);
  }

  return (
    <div>
      <div className="toolbar" style={{ alignItems: "center" }}>
        <a className="btn" href={`/project/${params.id}/flows`}>
          ← All flows
        </a>
        <div style={{ flex: 1 }} />
        <span className="muted">Latest saved: v{latest?.version ?? 0}</span>
        <button className="btn danger" onClick={() => setConfirmingDelete(true)}>
          Delete flow
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Details</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%" }} />
          </label>
          <button className="btn" onClick={handleSaveMetadata} disabled={savingMetadata} style={{ justifySelf: "start" }}>
            {savingMetadata ? "Saving..." : "Save details"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Steps (editing draft for the next version)</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85em" }}>
          Changes here don't affect test cases that already inserted v{latest?.version ?? 0} (or earlier)
          until you save a new version below and they explicitly update to it.
        </p>
        <StepListEditor steps={steps} onChange={setSteps} />
      </div>

      <div className="card">
        <h2 className="section-title">Save as new version</h2>
        <label>
          Changelog note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. added a wait for the 2FA prompt"
            style={{ width: "100%" }}
          />
        </label>
        <button className="btn primary" onClick={handleSaveVersion} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? "Saving..." : `Save as v${(latest?.version ?? 0) + 1}`}
        </button>

        {flow.versions.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3 className="section-title" style={{ fontSize: "0.95em" }}>
              Version history
            </h3>
            {flow.versions
              .slice()
              .reverse()
              .map((v) => (
                <div key={v.id} className="list-item">
                  <span>
                    v{v.version} &middot; {v.steps.length} step(s)
                    {v.note && <span className="muted"> &mdash; {v.note}</span>}
                  </span>
                  <span className="muted">
                    {v.createdBy?.username ?? "unknown"} &middot; {new Date(v.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete flow?"
          message="Test cases that already inserted a version of this flow keep their steps unaffected -- this only removes the flow itself and its version history."
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
