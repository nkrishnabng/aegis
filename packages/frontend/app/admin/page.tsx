"use client";

import { useEffect, useState } from "react";
import type { AdminConfig, UserRole, UserSummary } from "@testingmcp/shared";
import { api } from "../../lib/api";
import { SkeletonBlock } from "../../components/Skeleton";
import { useToast } from "../../components/ToastProvider";
import { ToastProvider } from "../../components/ToastProvider";

function AdminPageInner() {
  const { showToast } = useToast();
  const [me, setMe] = useState<UserSummary | null>(null);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("member");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function load() {
    api.listUsers().then(setUsers).catch(() => setUsers([]));
  }

  useEffect(() => {
    api.me().then((u) => {
      setMe(u);
      if (u.role === "admin") {
        api.getAdminConfig().then(setConfig).catch(() => setConfig(null));
        load();
      }
    }).catch(() => setMe(null));
  }, []);

  async function handleCreate() {
    if (!username.trim() || password.length < 6) return;
    setCreating(true);
    setError(null);
    try {
      await api.createUser(username.trim(), password, role);
      setUsername("");
      setPassword("");
      setRole("member");
      showToast("Teammate added.");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(u: UserSummary) {
    setEditingUserId(u.id);
    setEditRole(u.role);
    setEditPassword("");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingUserId(null);
    setEditPassword("");
    setEditError(null);
  }

  async function handleSaveEdit(u: UserSummary) {
    const updates: { password?: string; role?: UserRole } = {};
    if (editPassword) updates.password = editPassword;
    if (editRole !== u.role) updates.role = editRole;
    if (!updates.password && updates.role === undefined) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.updateUser(u.id, updates);
      showToast(`Updated ${u.username}.`);
      cancelEdit();
      load();
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="page-container">
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <p className="muted">
        Everyone with a login can view and run any test case. Only the creator of a test case (or an
        admin) can edit or delete it — others can flag issues with &quot;Request changes&quot; instead.
      </p>

      {me?.role === "admin" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-title">System configuration</h2>
          {!config ? (
            <SkeletonBlock lines={2} />
          ) : (
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              <div>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Active model
                </div>
                <strong>{config.model}</strong>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Credential encryption
                </div>
                <strong style={{ color: config.credentialEncryptionConfigured ? "var(--success)" : "var(--warning)" }}>
                  {config.credentialEncryptionConfigured ? "Configured" : "Not configured"}
                </strong>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Default browser
                </div>
                <strong>{config.defaultBrowser}</strong>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Default headless
                </div>
                <strong>{config.defaultHeadless ? "Yes" : "No"}</strong>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Max parallel runs
                </div>
                <strong>{config.maxParallelRuns}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {me?.role === "admin" && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 420 }}>
          <h2 className="section-title">Add a teammate</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
            <button
              className="btn primary"
              onClick={handleCreate}
              disabled={creating || !username.trim() || password.length < 6}
            >
              {creating ? "Adding..." : "Add teammate"}
            </button>
          </div>
        </div>
      )}

      {me && me.role !== "admin" && (
        <p className="muted">Teammate and system-configuration management is admin-only.</p>
      )}

      {me?.role === "admin" && (
      <div className="card">
        <h2 className="section-title">Everyone with access</h2>
        {!users && <SkeletonBlock lines={3} />}
        {users?.map((u) => (
          <div key={u.id} className="list-item" style={{ alignItems: "flex-start" }}>
            <span>{u.username}</span>
            {editingUserId === u.id ? (
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                  <input
                    type="password"
                    placeholder="New password (leave blank to keep)"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    style={{ width: 220 }}
                  />
                </div>
                {editError && <p style={{ color: "var(--danger)", margin: 0 }}>{editError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={cancelEdit} disabled={savingEdit}>
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => handleSaveEdit(u)}
                    disabled={savingEdit || (editPassword.length > 0 && editPassword.length < 6)}
                  >
                    {savingEdit ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              me?.role === "admin" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="badge">{u.role}</span>
                  <button className="btn" onClick={() => startEdit(u)}>
                    Edit
                  </button>
                </div>
              ) : (
                <span className="badge">{u.role}</span>
              )
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <ToastProvider>
      <AdminPageInner />
    </ToastProvider>
  );
}
