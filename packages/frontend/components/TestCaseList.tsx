"use client";

import { useMemo, useState } from "react";
import type { TestCaseRecord, TestCasePriority, TestCaseStatus, TestCaseType } from "@testingmcp/shared";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

interface TestCaseListProps {
  testCases: TestCaseRecord[];
  onOpen: (id: string) => void;
  onRun: (id: string) => void;
  runningIds: Set<string>;
}

const ALL = "all";

export function TestCaseList({ testCases, onOpen, onRun, runningIds }: TestCaseListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TestCaseStatus | typeof ALL>(ALL);
  const [typeFilter, setTypeFilter] = useState<TestCaseType | typeof ALL>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<TestCasePriority | typeof ALL>(ALL);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return testCases.filter((tc) => {
      if (statusFilter !== ALL && tc.status !== statusFilter) return false;
      if (typeFilter !== ALL && tc.type !== typeFilter) return false;
      if (priorityFilter !== ALL && tc.priority !== priorityFilter) return false;
      if (q && !tc.title.toLowerCase().includes(q) && !tc.objective.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [testCases, search, statusFilter, typeFilter, priorityFilter]);

  if (testCases.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No test cases yet"
        description="Ask the agent in chat to generate some."
      />
    );
  }

  return (
    <div>
      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search title or objective..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TestCaseStatus | typeof ALL)}>
          <option value={ALL}>All statuses</option>
          <option value="draft">draft</option>
          <option value="approved">approved</option>
          <option value="archived">archived</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TestCaseType | typeof ALL)}>
          <option value={ALL}>All types</option>
          <option value="smoke">smoke</option>
          <option value="regression">regression</option>
          <option value="functional">functional</option>
          <option value="negative">negative</option>
          <option value="ui">ui</option>
          <option value="accessibility">accessibility</option>
          <option value="edgeCase">edgeCase</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TestCasePriority | typeof ALL)}
        >
          <option value={ALL}>All priorities</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
      </div>

      {filtered.length === 0 && <p className="muted">No test cases match these filters.</p>}

      {filtered.map((tc) => (
        <div key={tc.id} className="list-item" style={{ alignItems: "flex-start" }}>
          <div style={{ cursor: "pointer" }} onClick={() => onOpen(tc.id)}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>{tc.title}</strong>
              <StatusBadge status={tc.status} />
              <span className="badge">{tc.type}</span>
              <span className="badge">{tc.priority}</span>
            </div>
            <div className="muted">{tc.objective}</div>
            <div className="muted">
              {tc.steps.length} step(s) · owner: {tc.createdBy?.username ?? "unowned"} · v{tc.version}
              {tc.openChangeRequestCount > 0 && (
                <span className="badge failed" style={{ marginLeft: 6 }}>
                  {tc.openChangeRequestCount} flagged
                </span>
              )}
            </div>
            {tc.tags.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                {tc.tags.map((tag) => (
                  <span key={tag} className="badge">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" onClick={() => onOpen(tc.id)}>
              Edit
            </button>
            <button
              className="btn primary"
              disabled={runningIds.has(tc.id)}
              onClick={() => onRun(tc.id)}
            >
              {runningIds.has(tc.id) ? "Running..." : "Run"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
