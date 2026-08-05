"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { VisualDiffRecord } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { useToast } from "../../../../components/ToastProvider";
import { EmptyState } from "../../../../components/EmptyState";

export default function VisualRegressionPage() {
  const params = useParams<{ id: string }>();
  const [diffs, setDiffs] = useState<VisualDiffRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    api.listVisualDiffs(params.id).then(setDiffs).catch((err) => setError((err as Error).message));
  }

  useEffect(load, [params.id]);

  async function handleApprove(id: string) {
    await api.approveVisualDiff(id);
    load();
    showToast("Approved -- this screenshot is now the baseline.");
  }

  async function handleReject(id: string) {
    await api.rejectVisualDiff(id);
    load();
    showToast("Rejected -- baseline unchanged.");
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Visual regression</h1>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <p className="muted">
        Whenever an <code>assertVisualMatch</code> step's screenshot differs from its stored baseline
        by more than the threshold, it shows up here for review. Approving promotes the new screenshot
        to be the baseline; rejecting leaves the baseline as-is (the step stays failed until you fix
        the underlying change).
      </p>

      {diffs.length === 0 && (
        <EmptyState
          icon="🖼️"
          title="No pending visual diffs"
          description="Diffs beyond the threshold from assertVisualMatch steps will show up here for review."
        />
      )}

      {diffs.map((diff) => (
        <div className="card" key={diff.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="badge failed">{diff.diffPercent.toFixed(2)}% different</span>
            <span className="muted">{new Date(diff.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
            <div>
              <strong>Baseline</strong>
              <img
                src={api.visualRegressionUrl(diff.baselinePath)}
                alt="Baseline"
                style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            </div>
            <div>
              <strong>Actual</strong>
              <img
                src={api.visualRegressionUrl(diff.actualPath)}
                alt="Actual"
                style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            </div>
            <div>
              <strong>Diff</strong>
              <img
                src={api.visualRegressionUrl(diff.diffPath)}
                alt="Diff highlight"
                style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 10, paddingLeft: 0 }}>
            <button className="btn primary" onClick={() => handleApprove(diff.id)}>
              Approve (make this the baseline)
            </button>
            <button className="btn danger" onClick={() => handleReject(diff.id)}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
