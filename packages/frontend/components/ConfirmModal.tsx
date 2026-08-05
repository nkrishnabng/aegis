"use client";

import { useState } from "react";

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  confirmText,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** If set, the confirm button stays disabled until the user types this
   * exact text -- an extra guard for destructive actions with a large blast
   * radius (e.g. deleting a whole project), on top of the modal itself. */
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const locked = confirmText !== undefined && typed !== confirmText;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p className="muted">{message}</p>
        {confirmText !== undefined && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              Type <strong style={{ color: "var(--text)" }}>{confirmText}</strong> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              style={{ width: "100%", marginTop: 6 }}
              autoFocus
            />
          </label>
        )}
        <div className="toolbar" style={{ marginBottom: 0, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm} disabled={locked}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
