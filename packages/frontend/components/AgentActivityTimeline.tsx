"use client";

import { useState } from "react";
import type { AgentActivityEventRecord, AgentTurnStage } from "@testingmcp/shared";
import { TERMINAL_AGENT_STAGES } from "@testingmcp/shared";
import { formatElapsed, useTick } from "../lib/useElapsedTime";
import {
  BotIcon,
  BugIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  EditIcon,
  HelpCircleIcon,
  SearchIcon,
  XIcon,
} from "./icons";
import type { IconProps } from "./icons";

const STAGE_META: Record<
  AgentTurnStage,
  { label: string; Icon: (p: IconProps) => React.ReactNode; color: string; badgeClass: string }
> = {
  queued: { label: "Queued", Icon: ClockIcon, color: "var(--text-dim)", badgeClass: "pending" },
  understanding: { label: "Understanding", Icon: BotIcon, color: "var(--accent-2)", badgeClass: "running" },
  analyzing: { label: "Analyzing", Icon: SearchIcon, color: "var(--accent-2)", badgeClass: "running" },
  generating_test_cases: { label: "Generating", Icon: EditIcon, color: "var(--accent-2)", badgeClass: "running" },
  completed: { label: "Completed", Icon: CheckIcon, color: "var(--success)", badgeClass: "passed" },
  waiting_for_user: { label: "Waiting for you", Icon: HelpCircleIcon, color: "var(--warning)", badgeClass: "waiting" },
  failed: { label: "Failed", Icon: BugIcon, color: "var(--danger)", badgeClass: "failed" },
  cancelled: { label: "Cancelled", Icon: XIcon, color: "var(--text-dim)", badgeClass: "skipped" },
};

function ActivityRow({ event }: { event: AgentActivityEventRecord }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STAGE_META[event.stage];
  const hasDetail = !!(event.detail || event.toolName);
  return (
    <div className="activity-row">
      <div className="activity-row-icon" style={{ color: meta.color }}>
        <meta.Icon size={15} strokeWidth={1.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: hasDetail ? "pointer" : "default" }}
          onClick={() => hasDetail && setExpanded((e) => !e)}
        >
          <span style={{ fontSize: "0.8rem" }}>{event.label}</span>
          <span className="muted" style={{ fontSize: "0.68rem", flexShrink: 0 }}>
            {new Date(event.createdAt).toLocaleTimeString()}
          </span>
          {hasDetail && (
            <ChevronDownIcon
              size={12}
              color="var(--text-dim)"
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
            />
          )}
        </div>
        {expanded && hasDetail && (
          <div className="muted" style={{ fontSize: "0.7rem", marginTop: 4, whiteSpace: "pre-wrap" }}>
            {event.toolName && (
              <div>
                tool call: <code>{event.toolName}</code>
              </div>
            )}
            {event.detail && <div>{event.detail}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** The activity-timeline panel for one chat turn: a live status banner
 * (stage, elapsed time, cancel) plus every stage transition the agent has
 * gone through, each expandable for its technical detail. `events` should
 * already be scoped to a single turnId, oldest first. */
export function AgentActivityTimeline({
  events,
  onCancel,
  cancelling,
}: {
  events: AgentActivityEventRecord[];
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const latest = events[events.length - 1] ?? null;
  const isActive = !!latest && !TERMINAL_AGENT_STAGES.includes(latest.stage);
  useTick(isActive);

  if (events.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          No activity yet -- send a message to get started.
        </p>
      </div>
    );
  }

  const startedAt = new Date(events[0].createdAt).getTime();
  const endedAt = isActive ? Date.now() : new Date(latest!.createdAt).getTime();
  const meta = STAGE_META[latest!.stage];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div className={`badge ${meta.badgeClass}`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <meta.Icon size={12} strokeWidth={2} />
          {meta.label}
        </div>
        <span className="muted" style={{ fontSize: "0.72rem" }}>
          {formatElapsed(endedAt - startedAt)}
        </span>
        <div style={{ flex: 1 }} />
        {isActive && onCancel && (
          <button className="btn danger" style={{ fontSize: "0.75rem", padding: "3px 10px" }} onClick={onCancel} disabled={cancelling}>
            {cancelling ? "Cancelling..." : "Cancel"}
          </button>
        )}
      </div>
      <div className="activity-timeline">
        {events.map((event) => (
          <ActivityRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
