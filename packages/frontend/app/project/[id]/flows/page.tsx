"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { FlowSummary } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { useToast } from "../../../../components/ToastProvider";
import { EmptyState } from "../../../../components/EmptyState";
import { ConfirmModal } from "../../../../components/ConfirmModal";

export default function FlowsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function reload() {
    api.listFlows(params.id).then(setFlows);
  }

  useEffect(reload, [params.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const flow = await api.createFlow(params.id, { name: name.trim(), description: description.trim() || null }, []);
      router.push(`/project/${params.id}/flows/${flow.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteFlow(id);
    setPendingDeleteId(null);
    reload();
    showToast("Flow deleted.");
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Flows</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        A reusable, named sequence of steps (e.g. "Login as standard user") you can insert into any
        test case. Editing a flow creates a new version rather than changing test cases that already
        used it -- they keep running whatever version they inserted until you explicitly update them.
      </p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">New flow</h2>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Login as standard user"
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="optional"
              style={{ width: "100%" }}
            />
          </label>
          <button className="btn primary" type="submit" disabled={creating || !name.trim()}>
            {creating ? "Creating..." : "Create & edit steps"}
          </button>
        </form>
      </div>

      {flows.map((flow) => (
        <div className="card" key={flow.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{flow.name}</strong>{" "}
              <span className="muted">
                v{flow.latestVersion} &middot; {flow.latestStepCount} step(s)
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="btn" href={`/project/${params.id}/flows/${flow.id}`}>
                Edit
              </a>
              <button className="btn danger" onClick={() => setPendingDeleteId(flow.id)}>
                Delete
              </button>
            </div>
          </div>
          {flow.description && <p className="muted" style={{ margin: "4px 0 0" }}>{flow.description}</p>}
        </div>
      ))}
      {flows.length === 0 && (
        <EmptyState
          icon="🔁"
          title="No flows yet"
          description="Create one above, then insert it into any test case from the test case editor's Steps card."
        />
      )}

      {pendingDeleteId && (
        <ConfirmModal
          title="Delete flow?"
          message="Test cases that already inserted a version of this flow keep their steps unaffected -- this only removes the flow itself and its version history."
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
