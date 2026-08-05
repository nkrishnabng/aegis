"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectRecord } from "@testingmcp/shared";
import { api } from "../lib/api";
import { Stepper } from "../components/Stepper";
import { EmptyState } from "../components/EmptyState";
import { SkeletonBlock } from "../components/Skeleton";
import { ConfirmModal } from "../components/ConfirmModal";
import { ToastProvider, useToast } from "../components/ToastProvider";
import { EditIcon, TrashIcon } from "../components/icons";

const STEPS = ["Name project", "Add URL", "Start testing"];

function HomePageInner() {
  const router = useRouter();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  function loadProjects() {
    api.listProjects().then(setProjects).catch((err) => setError(err.message));
  }

  useEffect(loadProjects, []);

  function startEdit(e: React.MouseEvent, p: ProjectRecord) {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  }

  async function saveEdit(e: React.MouseEvent | React.FormEvent, p: ProjectRecord) {
    e.stopPropagation();
    e.preventDefault();
    if (!editName.trim() || editName === p.name) {
      setEditingId(null);
      return;
    }
    setSavingEdit(true);
    try {
      await api.updateProject(p.id, editName.trim());
      setEditingId(null);
      loadProjects();
      showToast("Project renamed.");
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteProject(pendingDelete.id);
      setPendingDelete(null);
      loadProjects();
      showToast(`"${pendingDelete.name}" deleted.`);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  function resetWizard() {
    setCreating(false);
    setStep(0);
    setName("");
    setUrl("");
    setCreatedProjectId(null);
    setError(null);
  }

  async function handleCreateProject() {
    if (!name.trim()) return;
    setStep(1);
  }

  async function handleAddUrl() {
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject(name.trim());
      const { reachable, reachabilityNote } = await api.addUrl(project.id, url.trim());
      if (!reachable) {
        console.warn("URL reachability check failed (proceeding anyway):", reachabilityNote);
      }
      setCreatedProjectId(project.id);
      setStep(2);
      api.listProjects().then(setProjects);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      {!creating && (
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>Projects</h1>
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New project
          </button>
        </div>
      )}

      {creating && (
        <section className="card" style={{ marginBottom: 24, maxWidth: 560 }}>
          <Stepper steps={STEPS} current={step} />

          {step === 0 && (
            <>
              <h2 style={{ marginTop: 0 }}>What are you testing?</h2>
              <input
                placeholder="Project name (e.g. Checkout flow)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", marginBottom: 12 }}
                autoFocus
              />
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <button className="btn" onClick={resetWizard}>
                  Cancel
                </button>
                <button className="btn primary" onClick={handleCreateProject} disabled={!name.trim()}>
                  Next
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 style={{ marginTop: 0 }}>Where does it live?</h2>
              <input
                placeholder="https://your-app.example.com/login"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{ width: "100%", marginBottom: 12 }}
                autoFocus
              />
              {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <button className="btn" onClick={() => setStep(0)}>
                  Back
                </button>
                <button className="btn primary" onClick={handleAddUrl} disabled={!url.trim() || submitting}>
                  {submitting ? "Creating..." : "Create project"}
                </button>
              </div>
            </>
          )}

          {step === 2 && createdProjectId && (
            <>
              <h2 style={{ marginTop: 0 }}>You&apos;re set up 🎉</h2>
              <p className="muted">
                Now chat with the agent to inspect the page and generate your first test cases.
              </p>
              <button className="btn primary" onClick={() => router.push(`/project/${createdProjectId}`)}>
                Go to workspace
              </button>
            </>
          )}
        </section>
      )}

      {!projects && <SkeletonBlock lines={3} />}

      {projects?.length === 0 && !creating && (
        <EmptyState
          icon="🧪"
          title="No projects yet"
          description="Create one to start generating and running tests from a chat."
          action={
            <button className="btn primary" onClick={() => setCreating(true)}>
              + New project
            </button>
          }
        />
      )}

      {projects && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((p) => {
            const canManage = p.myRole === "owner";
            const isEditing = editingId === p.id;
            return (
              <div
                key={p.id}
                className="project-card"
                onClick={() => !isEditing && router.push(`/project/${p.id}/dashboard`)}
                style={{ cursor: isEditing ? "default" : "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  {isEditing ? (
                    <form onSubmit={(e) => saveEdit(e, p)} onClick={(e) => e.stopPropagation()} style={{ flex: 1 }}>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: "100%" }}
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button className="btn primary" type="submit" disabled={savingEdit || !editName.trim()}>
                          {savingEdit ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <strong>{p.name}</strong>
                      {canManage && (
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button
                            className="btn"
                            style={{ padding: 6 }}
                            title="Rename project"
                            onClick={(e) => startEdit(e, p)}
                          >
                            <EditIcon size={14} strokeWidth={1.8} />
                          </button>
                          <button
                            className="btn danger"
                            style={{ padding: 6 }}
                            title="Delete project"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete(p);
                            }}
                          >
                            <TrashIcon size={14} strokeWidth={1.8} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {!isEditing && (
                  <>
                    <div className="muted" style={{ margin: "4px 0" }}>
                      {p.urls[0]?.url ?? "No URL yet"}
                    </div>
                    <div className="muted" style={{ fontSize: "0.8em" }}>
                      {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete this project?"
          message="This permanently deletes every test case, run, environment, credential, flow, and integration in it. This can't be undone."
          confirmLabel={deleting ? "Deleting..." : "Delete project"}
          confirmText={pendingDelete.name}
          danger
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <ToastProvider>
      <HomePageInner />
    </ToastProvider>
  );
}
