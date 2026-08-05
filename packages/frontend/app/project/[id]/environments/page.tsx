"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { BrowserName, EnvironmentInput } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { useProjectContext } from "../../../../lib/ProjectContext";
import { useToast } from "../../../../components/ToastProvider";
import { EmptyState } from "../../../../components/EmptyState";
import { ConfirmModal } from "../../../../components/ConfirmModal";

const BLANK_INPUT: EnvironmentInput = {
  name: "",
  baseUrl: "",
  browser: "chromium",
  headless: true,
  viewportWidth: 1280,
  viewportHeight: 720,
  isDefault: false,
};

export default function EnvironmentsPage() {
  const params = useParams<{ id: string }>();
  const { environments, refreshEnvironments } = useProjectContext();
  const { showToast } = useToast();
  const [form, setForm] = useState<EnvironmentInput>(BLANK_INPUT);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, string>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createEnvironment(params.id, form);
      setForm(BLANK_INPUT);
      refreshEnvironments();
      showToast("Environment created.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string, patch: Partial<EnvironmentInput>) {
    await api.updateEnvironment(id, patch);
    refreshEnvironments();
  }

  async function handleDelete(id: string) {
    await api.deleteEnvironment(id);
    setPendingDeleteId(null);
    refreshEnvironments();
    showToast("Environment deleted.");
  }

  async function handleSaveCredentials(id: string) {
    const raw = credentialDrafts[id] ?? "";
    try {
      const values = Object.fromEntries(
        raw
          .split("\n")
          .map((line) => line.split("="))
          .filter(([k]) => k?.trim())
          .map(([k, ...rest]) => [k.trim(), rest.join("=").trim()]),
      );
      await api.setEnvironmentCredentials(id, values);
      setCredentialDrafts((prev) => ({ ...prev, [id]: "" }));
      refreshEnvironments();
      showToast("Credentials saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Environments</h1>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Add environment</h2>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="dev / qa / staging / prod"
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Base URL
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://staging.example.com"
              style={{ width: "100%" }}
            />
          </label>
          <div style={{ display: "flex", gap: 16 }}>
            <label>
              Browser
              <select
                value={form.browser}
                onChange={(e) => setForm({ ...form, browser: e.target.value as BrowserName })}
              >
                <option value="chromium">chromium</option>
                <option value="firefox">firefox</option>
                <option value="webkit">webkit</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={form.headless}
                onChange={(e) => setForm({ ...form, headless: e.target.checked })}
              />
              headless
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              default
            </label>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <label>
              Viewport width
              <input
                type="number"
                value={form.viewportWidth}
                onChange={(e) => setForm({ ...form, viewportWidth: Number(e.target.value) })}
              />
            </label>
            <label>
              Viewport height
              <input
                type="number"
                value={form.viewportHeight}
                onChange={(e) => setForm({ ...form, viewportHeight: Number(e.target.value) })}
              />
            </label>
          </div>
          <button className="btn primary" type="submit" disabled={creating}>
            {creating ? "Adding..." : "Add environment"}
          </button>
        </form>
      </div>

      {environments.map((env) => (
        <div className="card" key={env.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              {env.name} {env.isDefault && <span className="badge">default</span>}
            </strong>
            <button className="btn danger" onClick={() => setPendingDeleteId(env.id)}>
              Delete
            </button>
          </div>
          <p className="muted" style={{ margin: "4px 0" }}>
            {env.baseUrl} &middot; {env.browser} &middot; {env.headless ? "headless" : "headed"} &middot;{" "}
            {env.viewportWidth}x{env.viewportHeight}
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={env.isDefault}
              onChange={(e) => handleUpdate(env.id, { isDefault: e.target.checked })}
            />
            Make default
          </label>
          <div style={{ marginTop: 8 }}>
            <label>
              Credentials ({env.hasCredentials ? "set" : "not set"}) -- one KEY=value per line, e.g.
              username=tomsmith
              <textarea
                rows={3}
                placeholder="username=...\npassword=..."
                value={credentialDrafts[env.id] ?? ""}
                onChange={(e) => setCredentialDrafts((prev) => ({ ...prev, [env.id]: e.target.value }))}
                style={{ width: "100%", fontFamily: "ui-monospace, monospace" }}
              />
            </label>
            <button className="btn" onClick={() => handleSaveCredentials(env.id)} style={{ marginTop: 6 }}>
              Save credentials
            </button>
            <p className="muted" style={{ fontSize: "0.85em" }}>
              Reference these in a step's value as <code>{"{{env.username}}"}</code> -- they're encrypted at
              rest and never shown back in the UI.
            </p>
          </div>
        </div>
      ))}
      {environments.length === 0 && (
        <EmptyState
          icon="🌐"
          title="No environments yet"
          description="Add one above to run tests against dev, QA, staging, or prod with its own browser and credentials."
        />
      )}

      {pendingDeleteId && (
        <ConfirmModal
          title="Delete environment?"
          message="This cannot be undone. Test runs that already used it keep their history."
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
