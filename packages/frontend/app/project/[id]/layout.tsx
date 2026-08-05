"use client";

import { useParams } from "next/navigation";
import { ProjectProvider, useProjectContext } from "../../../lib/ProjectContext";
import { ToastProvider } from "../../../components/ToastProvider";

function ProjectTopBar() {
  const { project, environments, environmentId, setEnvironmentId } = useProjectContext();
  return (
    <div className="project-top-bar">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 650, letterSpacing: "-0.2px", lineHeight: 1.15 }}>
          {project?.name ?? "Loading..."}
        </div>
        <div className="muted" style={{ fontSize: "0.75rem", lineHeight: 1.15 }}>
          {project?.urls[0]?.url}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {environments.length > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted">Environment</span>
          <select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <ProjectProvider projectId={params.id}>
      <ToastProvider>
        <ProjectTopBar />
        <div className="project-content">{children}</div>
      </ToastProvider>
    </ProjectProvider>
  );
}
