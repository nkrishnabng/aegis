"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectRecord, UserSummary } from "@testingmcp/shared";
import { api } from "../../lib/api";
import { ToastProvider, useToast } from "../../components/ToastProvider";
import { SkeletonBlock } from "../../components/Skeleton";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? [parts[0][0], parts[1][0]] : [name.slice(0, 2)];
  return chars.join("").toUpperCase();
}

function ProfilePageInner() {
  const router = useRouter();
  const { showToast } = useToast();
  const [me, setMe] = useState<UserSummary | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  async function handleLogout() {
    await api.logout();
    router.push("/login");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated. You're still signed in here; other devices were signed out.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!me) return <SkeletonBlock lines={6} />;

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Profile</h1>

      <div className="card" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div
          className="user-avatar"
          style={{ width: 52, height: 52, borderRadius: 12, fontSize: 18 }}
        >
          {initials(me.username)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>{me.username}</div>
          <span className="badge" style={{ marginTop: 4, display: "inline-block", textTransform: "capitalize" }}>
            {me.role === "admin" ? "Site admin" : "Member"}
          </span>
        </div>
        <button className="btn danger" onClick={handleLogout}>
          Log out
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Your projects</h2>
        {!projects ? (
          <SkeletonBlock lines={2} />
        ) : projects.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            You're not a member of any project yet.
          </p>
        ) : (
          projects.map((p) => (
            <div key={p.id} className="list-item" style={{ cursor: "pointer" }} onClick={() => router.push(`/project/${p.id}`)}>
              <span>{p.name}</span>
              <span className="badge" style={{ textTransform: "capitalize" }}>{p.myRole ?? "member"}</span>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <h2 className="section-title">Change password</h2>
        <form onSubmit={handleChangePassword} style={{ display: "grid", gap: 10 }}>
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="New password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
          <button
            className="btn primary"
            type="submit"
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
          >
            {saving ? "Saving..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ToastProvider>
      <ProfilePageInner />
    </ToastProvider>
  );
}
