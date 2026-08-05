export function EmptyState({
  icon = "🗂️",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <p style={{ fontWeight: 600, color: "var(--text)", margin: "0 0 4px" }}>{title}</p>
      {description && <p className="muted">{description}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
