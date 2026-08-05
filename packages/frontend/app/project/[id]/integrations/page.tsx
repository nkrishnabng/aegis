"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { IntegrationInput, IntegrationSummary, IntegrationType, UserSummary } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { useToast } from "../../../../components/ToastProvider";

const BLANK_FORM: IntegrationInput = { baseUrl: "", email: "", projectKey: "", apiToken: "" };

interface TrackerCopy {
  label: string;
  helpText: string;
  baseUrlLabel: string;
  baseUrlPlaceholder: string;
  showEmail: boolean;
  emailLabel: string;
  emailPlaceholder: string;
  projectKeyLabel: string;
  projectKeyPlaceholder: string;
  tokenPlaceholder: string;
  footerNote: string;
}

const TRACKER_COPY: Record<IntegrationType, TrackerCopy> = {
  jira: {
    label: "Jira",
    helpText: "Connect this project to Jira Cloud to push a failed run's diagnosis as an issue.",
    baseUrlLabel: "Base URL",
    baseUrlPlaceholder: "https://yourcompany.atlassian.net",
    showEmail: true,
    emailLabel: "Account email",
    emailPlaceholder: "you@yourcompany.com",
    projectKeyLabel: "Project key",
    projectKeyPlaceholder: "QA",
    tokenPlaceholder: "Generated at id.atlassian.com/manage-profile/security/api-tokens",
    footerNote: "Jira Cloud only -- Server/Data Center isn't supported.",
  },
  githubIssues: {
    label: "GitHub Issues",
    helpText: "Connect a GitHub repo to push a failed run's diagnosis as an issue.",
    baseUrlLabel: "API base URL",
    baseUrlPlaceholder: "https://api.github.com",
    showEmail: false,
    emailLabel: "",
    emailPlaceholder: "",
    projectKeyLabel: "Repository (owner/repo)",
    projectKeyPlaceholder: "yourorg/yourrepo",
    tokenPlaceholder: "A classic PAT with the repo scope, or a fine-grained PAT with Issues: write",
    footerNote: "For GitHub Enterprise Server, set the base URL to https://<host>/api/v3.",
  },
  azureDevOps: {
    label: "Azure DevOps",
    helpText: "Connect an Azure DevOps project to push a failed run's diagnosis as a work item.",
    baseUrlLabel: "Organization URL",
    baseUrlPlaceholder: "https://dev.azure.com/yourorg",
    showEmail: false,
    emailLabel: "",
    emailPlaceholder: "",
    projectKeyLabel: "Project name",
    projectKeyPlaceholder: "YourProject",
    tokenPlaceholder: "A Personal Access Token with Work Items: read & write",
    footerNote: "Creates a Bug work item in the given project.",
  },
};

const TRACKER_TYPES: IntegrationType[] = ["jira", "githubIssues", "azureDevOps"];

function IntegrationCard({
  type,
  summary,
  isAdmin,
  onSaved,
}: {
  type: IntegrationType;
  summary: IntegrationSummary | null;
  isAdmin: boolean;
  onSaved: (updated: IntegrationSummary) => void;
}) {
  const copy = TRACKER_COPY[type];
  const [form, setForm] = useState<IntegrationInput>(
    summary
      ? { baseUrl: summary.baseUrl, email: summary.email, projectKey: summary.projectKey, apiToken: "" }
      : BLANK_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const params = useParams<{ id: string }>();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = form.apiToken
        ? form
        : { baseUrl: form.baseUrl, email: form.email, projectKey: form.projectKey };
      const updated = await api.updateIntegration(params.id, type, payload);
      onSaved(updated);
      setForm((prev) => ({ ...prev, apiToken: "" }));
      showToast(`${copy.label} integration saved.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480, marginTop: 16 }}>
      <h2 className="section-title">{copy.label}</h2>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        Status: {summary ? `Configured (${summary.baseUrl}, ${summary.projectKey})` : "Not configured"}
      </p>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.85em" }}>{copy.helpText}</p>

      {!isAdmin && (
        <p className="muted" style={{ fontSize: "0.85em" }}>
          Only an admin can configure or change {copy.label} credentials for this project.
        </p>
      )}

      {isAdmin && (
        <form onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
          {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
          <label>
            {copy.baseUrlLabel}
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder={copy.baseUrlPlaceholder}
              style={{ width: "100%" }}
            />
          </label>
          {copy.showEmail && (
            <label>
              {copy.emailLabel}
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder={copy.emailPlaceholder}
                style={{ width: "100%" }}
              />
            </label>
          )}
          <label>
            {copy.projectKeyLabel}
            <input
              value={form.projectKey}
              onChange={(e) => setForm({ ...form, projectKey: e.target.value })}
              placeholder={copy.projectKeyPlaceholder}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            API token
            <input
              type="password"
              value={form.apiToken}
              onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
              placeholder={
                summary?.hasApiToken
                  ? "Currently set -- re-enter to change, or leave as-is to keep it"
                  : copy.tokenPlaceholder
              }
              style={{ width: "100%" }}
            />
          </label>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <p className="muted" style={{ fontSize: "0.85em", margin: 0 }}>
            The token is encrypted at rest and never shown back in the UI. {copy.footerNote}
          </p>
        </form>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const params = useParams<{ id: string }>();
  const [me, setMe] = useState<UserSummary | null>(null);
  const [integrations, setIntegrations] = useState<Record<IntegrationType, IntegrationSummary | null> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.me(), api.getIntegrations(params.id)]).then(([user, result]) => {
      setMe(user);
      setIntegrations(result);
      setLoading(false);
    });
  }, [params.id]);

  if (loading || !integrations) return <p className="muted">Loading...</p>;

  const isAdmin = me?.role === "admin";

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Integrations</h1>
      <p className="muted">
        Connect this project to an issue tracker so a failed test run's diagnosis can be pushed with one
        click, from the run's results page. Only Jira has been live-verified against a real account so
        far -- GitHub Issues and Azure DevOps are built against each API's documented contract but not
        yet exercised against a live account.
      </p>

      {TRACKER_TYPES.map((type) => (
        <IntegrationCard
          key={type}
          type={type}
          summary={integrations[type]}
          isAdmin={isAdmin}
          onSaved={(updated) => setIntegrations((prev) => (prev ? { ...prev, [type]: updated } : prev))}
        />
      ))}
    </div>
  );
}
