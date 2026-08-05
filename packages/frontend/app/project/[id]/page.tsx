"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  AgentActivityEventRecord,
  ChatMessageRecord,
  ServerToClientMessage,
  TestCaseRecord,
  UsageTotals,
} from "@testingmcp/shared";
import { TERMINAL_AGENT_STAGES } from "@testingmcp/shared";
import { api } from "../../../lib/api";
import { useProjectSocket } from "../../../lib/useProjectSocket";
import { useProjectContext } from "../../../lib/ProjectContext";
import { useToast } from "../../../components/ToastProvider";
import { ChatPanel } from "../../../components/ChatPanel";
import { TestCaseList } from "../../../components/TestCaseList";
import { UsagePanel } from "../../../components/UsagePanel";
import { AgentActivityTimeline } from "../../../components/AgentActivityTimeline";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const { project, environmentId } = useProjectContext();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [activityEvents, setActivityEvents] = useState<AgentActivityEventRecord[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [usageTotals, setUsageTotals] = useState<UsageTotals | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastBatch, setLastBatch] = useState<{ batchId: string; count: number } | null>(null);
  const [requirement, setRequirement] = useState("");
  const [continueFromChat, setContinueFromChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listChat(projectId).then(setMessages);
    api.listTestCases(projectId).then(setTestCases);
    api.getUsage(projectId).then(setUsageTotals);
    // Refresh-recovery: rebuild the activity timeline for whatever turn was
    // last in progress (or last completed) instead of starting blank, so a
    // mid-generation page refresh doesn't lose visibility into what's
    // happening -- live `agent.activity` events append to this from here.
    api.listAgentActivity(projectId).then(setActivityEvents);
  }, [projectId]);

  const currentTurnId = activityEvents.length > 0 ? activityEvents[activityEvents.length - 1].turnId : null;
  const currentTurnEvents = useMemo(
    () => (currentTurnId ? activityEvents.filter((e) => e.turnId === currentTurnId) : []),
    [activityEvents, currentTurnId],
  );
  const latestStage = currentTurnEvents[currentTurnEvents.length - 1]?.stage ?? null;
  const isAgentActive = latestStage !== null && !TERMINAL_AGENT_STAGES.includes(latestStage);

  const onMessage = useCallback((event: ServerToClientMessage) => {
    switch (event.type) {
      case "chat.delta":
        setStreamingText((t) => t + event.text);
        break;
      case "chat.message":
        setMessages((prev) => [...prev, event.message]);
        if (event.message.role === "assistant") setStreamingText("");
        break;
      case "agent.activity":
        setActivityEvents((prev) => [...prev, event.event]);
        if (TERMINAL_AGENT_STAGES.includes(event.event.stage)) setCancelling(false);
        break;
      case "testcases.proposed":
        setTestCases((prev) => [...event.testCases, ...prev]);
        break;
      case "testcases.updated":
        setTestCases((prev) =>
          prev.map((tc) => (tc.id === event.testCase.id ? event.testCase : tc)),
        );
        break;
      case "usage.update":
        setUsageTotals(event.totals);
        break;
      case "error":
        setError(event.message);
        break;
      default:
        break;
    }
  }, []);

  const { send } = useProjectSocket(projectId, onMessage);

  function handleSend(text: string) {
    setError(null);
    send({ type: "chat.send", text, environmentId: environmentId || undefined });
  }

  function handleGenerateScenarios() {
    if (!requirement.trim()) return;
    handleSend(requirement.trim());
  }

  function handleCancel() {
    if (!currentTurnId) return;
    setCancelling(true);
    send({ type: "chat.cancel", turnId: currentTurnId });
  }

  function handleFileChosen(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setRequirement((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRun(testCaseId: string) {
    setError(null);
    setRunningIds((prev) => new Set(prev).add(testCaseId));
    try {
      const run = await api.runTestCase(testCaseId, environmentId || undefined, continueFromChat);
      router.push(`/project/${projectId}/runs/${run.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(testCaseId);
        return next;
      });
    }
  }

  async function handleRunAll() {
    setError(null);
    setRunningAll(true);
    try {
      const result = await api.runAll(projectId, environmentId || undefined, continueFromChat);
      setLastBatch({ batchId: result.batchId, count: result.testRunIds.length });
      showToast(`Started ${result.testRunIds.length} test run(s).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningAll(false);
    }
  }

  const draftCount = useMemo(
    () => testCases.filter((tc) => tc.status === "draft").length,
    [testCases],
  );

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Test Generation</h1>
          <div className="muted">
            {project?.name}
            {project?.urls[0]?.url ? ` · ${project.urls[0].url}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.85em" }}>
            <input
              type="checkbox"
              checked={continueFromChat}
              onChange={(e) => setContinueFromChat(e.target.checked)}
            />
            Continue from chat session
          </label>
          <a className="btn" href={api.exportCiPackageUrl(projectId)}>
            Export CI package
          </a>
          <button className="btn" onClick={handleRunAll} disabled={runningAll}>
            {runningAll ? "Running all..." : "Run all"}
          </button>
        </div>
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {continueFromChat && (
        <p className="muted" style={{ marginTop: -8, fontSize: "0.85em" }}>
          Runs started below will seed their browser session with the current chat session&apos;s
          cookies/localStorage (e.g. to skip re-login if chat already authenticated).
        </p>
      )}
      {lastBatch && (
        <p className="muted" style={{ marginTop: -8 }}>
          Last "Run all" started {lastBatch.count} test(s) &middot; download the{" "}
          <a href={api.batchJunitUrl(lastBatch.batchId)} style={{ color: "var(--accent)" }}>
            JUnit XML
          </a>{" "}
          or{" "}
          <a href={api.batchHtmlReportUrl(lastBatch.batchId)} style={{ color: "var(--accent)" }}>
            HTML report
          </a>{" "}
          once those runs finish.
        </p>
      )}
      <UsagePanel totals={usageTotals} />

      <div style={{ marginBottom: 16 }}>
        <h2 className="section-title">Agent activity</h2>
        <AgentActivityTimeline events={currentTurnEvents} onCancel={handleCancel} cancelling={cancelling} />
      </div>

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 className="section-title">Source Requirement</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Describe the feature, paste a user story, or attach a plain-text/markdown spec. The
              agent inspects the real page and extracts test scenarios.
            </p>
            <textarea
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              rows={7}
              placeholder={
                'e.g. "As a returning customer, I want to log in with my email and password so I can view my order history."'
              }
              style={{ width: "100%", marginBottom: 10 }}
            />
            <div className="toolbar" style={{ marginBottom: 0, paddingLeft: 0 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                style={{ display: "none" }}
                onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
              />
              <button className="btn" onClick={() => fileInputRef.current?.click()}>
                + Attach .txt/.md file
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn primary"
                onClick={handleGenerateScenarios}
                disabled={isAgentActive || !requirement.trim()}
              >
                {isAgentActive ? "Working..." : "✨ Generate Scenarios"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              Agent conversation
            </h2>
            <span className="muted" style={{ fontSize: "0.72rem" }}>
              Private to you -- other project members can't see this
            </span>
          </div>
          <ChatPanel messages={messages} streamingText={streamingText} onSend={handleSend} />
        </div>
        <div>
          <h2 className="section-title">
            AI-Generated Test Scenarios {draftCount > 0 && <span className="muted">({draftCount} draft)</span>}
          </h2>
          <p className="muted" style={{ marginTop: -6, fontSize: "0.72rem" }}>
            Shared with everyone who has access to this project
          </p>
          <TestCaseList
            testCases={testCases}
            onOpen={(id) => router.push(`/project/${projectId}/tests/${id}`)}
            onRun={handleRun}
            runningIds={runningIds}
          />
        </div>
      </div>
    </div>
  );
}
