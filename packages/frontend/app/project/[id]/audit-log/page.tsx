"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { AuditLogEntryRecord } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { EmptyState } from "../../../../components/EmptyState";

function describe(entry: AuditLogEntryRecord): string {
  const who = entry.username ?? "unknown user";
  const what = entry.action.replace(/[._]/g, " ");
  const target = entry.targetType ? ` ${entry.targetType}${entry.targetId ? ` (${entry.targetId.slice(-8)})` : ""}` : "";
  return `${who} ${what}${target}`;
}

export default function AuditLogPage() {
  const params = useParams<{ id: string }>();
  const [entries, setEntries] = useState<AuditLogEntryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listAuditLog(params.id).then(setEntries).catch((err) => setError((err as Error).message));
  }, [params.id]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Audit log</h1>
      <p className="muted">
        Membership changes, credential updates, and deletions for this project, most recent first.
      </p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {entries.length === 0 && (
        <EmptyState
          icon="📜"
          title="No audit entries yet"
          description="Membership changes, credential updates, and deletions will show up here."
        />
      )}

      {entries.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="muted">{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{describe(entry)}</td>
                <td className="muted">{entry.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
