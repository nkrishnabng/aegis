"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.login(username, password);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 360, margin: "80px auto" }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Sign in</h1>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%" }}
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
