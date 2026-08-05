"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PROJECT_ROLES, type ProjectMemberRecord, type ProjectRole, type UserSummary } from "@testingmcp/shared";
import { api } from "../../../../lib/api";
import { useProjectContext } from "../../../../lib/ProjectContext";
import { useToast } from "../../../../components/ToastProvider";
import { ConfirmModal } from "../../../../components/ConfirmModal";

const ROLES: ProjectRole[] = [...PROJECT_ROLES];

export default function MembersPage() {
  const params = useParams<{ id: string }>();
  const { project } = useProjectContext();
  const { showToast } = useToast();
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserSummary[]>([]);
  const [username, setUsername] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [role, setRole] = useState<ProjectRole>("editor");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const isOwner = project?.myRole === "owner";

  function load() {
    api.listMembers(params.id).then(setMembers).catch((err) => setError((err as Error).message));
    if (isOwner) {
      api.listAvailableMembers(params.id).then(setAvailableUsers).catch(() => setAvailableUsers([]));
    }
  }

  useEffect(load, [params.id, isOwner]);

  const matches = useMemo(() => {
    const q = username.trim().toLowerCase();
    const pool = q ? availableUsers.filter((u) => u.username.toLowerCase().includes(q)) : availableUsers;
    return pool.slice(0, 8);
  }, [username, availableUsers]);

  function selectUser(u: UserSummary) {
    setUsername(u.username);
    setShowPicker(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.addMember(params.id, username.trim(), role);
      setUsername("");
      load();
      showToast(`Added ${username.trim()} as ${role}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: ProjectRole) {
    await api.updateMemberRole(params.id, userId, newRole);
    load();
  }

  async function handleRemove(userId: string) {
    await api.removeMember(params.id, userId);
    setPendingRemove(null);
    load();
    showToast("Member removed.");
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Members</h1>
      <p className="muted">
        Only project members can see and act on this project (a site-wide admin always has full
        access). <strong>Owner</strong> can manage members and credentials; <strong>editor</strong> can
        create/edit/run/delete test cases, environments, and flows; <strong>reviewer</strong> is
        read-only and can approve or reject a test case someone else authored (but can't edit test
        content, and can't approve their own tests); <strong>viewer</strong> is read-only and can
        still run tests.
      </p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {isOwner && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
          <h2 className="section-title">Add member</h2>
          <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: 1, position: "relative" }}>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setShowPicker(true)}
                onBlur={() => setTimeout(() => setShowPicker(false), 120)}
                placeholder={availableUsers.length ? "Search existing users..." : "No other users to add yet"}
                autoComplete="off"
                style={{ width: "100%" }}
              />
              {showPicker && (
                <div
                  className="card"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    padding: 4,
                    zIndex: 10,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {matches.length > 0 ? (
                    matches.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectUser(u);
                        }}
                        className="list-item"
                        style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}
                      >
                        <span>{u.username}</span>
                        {u.role === "admin" && <span className="badge">site admin</span>}
                      </button>
                    ))
                  ) : (
                    <div className="muted" style={{ padding: "8px 10px", fontSize: "0.8rem" }}>
                      {availableUsers.length === 0
                        ? "Every existing user is already a member of this project."
                        : "No users match that search."}
                    </div>
                  )}
                </div>
              )}
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn primary" type="submit" disabled={adding || !username.trim()}>
              {adding ? "Adding..." : "Add"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="section-title">Current members</h2>
        {members.map((m) => (
          <div key={m.id} className="list-item">
            <span>
              {m.user.username} {m.user.role === "admin" && <span className="badge">site admin</span>}
            </span>
            {isOwner ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={m.role} onChange={(e) => handleRoleChange(m.user.id, e.target.value as ProjectRole)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button className="btn danger" onClick={() => setPendingRemove(m.user.id)}>
                  Remove
                </button>
              </div>
            ) : (
              <span className="badge">{m.role}</span>
            )}
          </div>
        ))}
      </div>

      {pendingRemove && (
        <ConfirmModal
          title="Remove member?"
          message="They'll immediately lose access to this project (unless they're a site-wide admin)."
          confirmLabel="Remove"
          danger
          onConfirm={() => handleRemove(pendingRemove)}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
