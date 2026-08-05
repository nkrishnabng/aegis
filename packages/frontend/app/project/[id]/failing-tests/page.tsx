"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { FailingTestRecord, TestCasePriority } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { SkeletonBlock } from "../../../../components/Skeleton";
import { EmptyState } from "../../../../components/EmptyState";
import { useToast } from "../../../../components/ToastProvider";

const PRIORITY_ORDER: TestCasePriority[] = ["critical", "high", "medium", "low"];

export default function FailingTestsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [tests, setTests] = useState<FailingTestRecord[] | null>(null);
  const [rerunningIds, setRerunningIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getFailingTests(params.id).then(setTests);
  }, [params.id]);

  async function handleRerun(testId: string, runId: string) {
    setRerunningIds((prev) => new Set(prev).add(testId));
    try {
      const run = await api.rerunTestRun(runId);
      router.push(`/project/${params.id}/runs/${run.id}`);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setRerunningIds((prev) => {
        const next = new Set(prev);
        next.delete(testId);
        return next;
      });
    }
  }

  if (!tests) return <SkeletonBlock lines={6} />;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Failing Tests</h1>
      <p className="muted">
        Every test case whose most recent run failed or errored, grouped by priority. Not a defect
        tracker (no severity/clustering/lifecycle) -- just the real current failure state.
      </p>

      {tests.length === 0 && (
        <EmptyState icon="✅" title="No failing tests" description="Everything's passing right now." />
      )}

      {PRIORITY_ORDER.map((priority) => {
        const group = tests.filter((t) => t.priority === priority);
        if (group.length === 0) return null;
        return (
          <div className="card" style={{ marginBottom: 16 }} key={priority}>
            <h2 className="section-title" style={{ textTransform: "capitalize" }}>
              {priority} ({group.length})
            </h2>
            {group.map((tc) => (
              <div className="list-item" key={tc.id} style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <a href={`/project/${params.id}/tests/${tc.id}`}>
                    <strong>{tc.title}</strong>
                  </a>
                  <div className="muted">{tc.module ?? "Unassigned"}</div>
                  {tc.latestRun?.errorMessage && (
                    <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 4 }}>
                      {tc.latestRun.errorMessage.slice(0, 200)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {tc.latestRun && (
                    <a className="btn" href={`/project/${params.id}/runs/${tc.latestRun.id}`}>
                      View run
                    </a>
                  )}
                  {tc.latestRun && (
                    <button
                      className="btn primary"
                      disabled={rerunningIds.has(tc.id)}
                      onClick={() => handleRerun(tc.id, tc.latestRun!.id)}
                    >
                      {rerunningIds.has(tc.id) ? "Rerunning..." : "Rerun"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
