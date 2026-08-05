import type { ReactNode } from "react";

export function InfoModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div className="muted" style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>
          {children}
        </div>
        <div className="toolbar" style={{ marginBottom: 0, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="hero-card-info-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      i
    </button>
  );
}
