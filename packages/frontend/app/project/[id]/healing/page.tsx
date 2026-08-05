"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { HealingEventRecord } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { useToast } from "../../../../components/ToastProvider";
import { EmptyState } from "../../../../components/EmptyState";

function selectorSummary(selector: HealingEventRecord["oldSelector"]): string {
  const value =
    selector.role ??
    selector.label ??
    selector.placeholder ??
    selector.altText ??
    selector.name ??
    selector.testId ??
    selector.css ??
    selector.xpath ??
    "";
  return `${selector.strategy}: ${value || selector.description}`;
}

export default function HealingEventsPage() {
  const params = useParams<{ id: string }>();
  const [events, setEvents] = useState<HealingEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    api.listHealingEvents(params.id).then(setEvents).catch((err) => setError((err as Error).message));
  }

  useEffect(load, [params.id]);

  async function handleApprove(id: string, makePrimary: boolean) {
    await api.approveHealingEvent(id, makePrimary);
    load();
    showToast(makePrimary ? "Approved as the new primary selector." : "Approved as an alternate locator.");
  }

  async function handleDismiss(id: string) {
    await api.dismissHealingEvent(id);
    load();
    showToast("Suggestion dismissed.");
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Self-healing suggestions</h1>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <p className="muted">
        Whenever a step's stored selector no longer matches the page and an alternate is found, it shows up
        here for review before it's applied permanently.
      </p>

      {events.length === 0 && (
        <EmptyState
          icon="🩹"
          title="No pending suggestions"
          description="Selector recoveries that happen during test runs will show up here for review."
        />
      )}

      {events.map((event) => (
        <div className="card" key={event.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className={`badge ${event.confidence === "high" ? "passed" : "failed"}`}>
              {event.confidence} confidence
            </span>
            <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
            <div>
              <strong>Old selector</strong>
              <p className="muted">{selectorSummary(event.oldSelector)}</p>
            </div>
            <div>
              <strong>New selector</strong>
              <p className="muted">{selectorSummary(event.newSelector)}</p>
            </div>
          </div>
          <p>{event.note}</p>
          {event.screenshotPath && (
            <img
              src={api.screenshotUrl(event.screenshotPath)}
              alt="Screenshot at healing time"
              style={{ maxWidth: 320, borderRadius: 8 }}
            />
          )}
          <div className="toolbar" style={{ marginTop: 10, paddingLeft: 0 }}>
            <button className="btn primary" onClick={() => handleApprove(event.id, true)}>
              Approve &amp; make primary
            </button>
            <button className="btn" onClick={() => handleApprove(event.id, false)}>
              Approve as alternate
            </button>
            <button className="btn danger" onClick={() => handleDismiss(event.id)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
