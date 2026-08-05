"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { EnvironmentRecord, ProjectRecord } from "@testingmcp/shared";
import { api } from "./api";

interface ProjectContextValue {
  project: ProjectRecord | null;
  environments: EnvironmentRecord[];
  environmentId: string;
  setEnvironmentId: (id: string) => void;
  refreshEnvironments: () => void;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [loading, setLoading] = useState(true);

  const refreshEnvironments = useCallback(() => {
    api.listEnvironments(projectId).then((envs) => {
      setEnvironments(envs);
      setEnvironmentId((current) => {
        if (current && envs.some((e) => e.id === current)) return current;
        const def = envs.find((e) => e.isDefault) ?? envs[0];
        return def?.id ?? "";
      });
    });
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getProject(projectId), api.listEnvironments(projectId)]).then(
      ([proj, envs]) => {
        setProject(proj);
        setEnvironments(envs);
        const def = envs.find((e) => e.isDefault) ?? envs[0];
        if (def) setEnvironmentId(def.id);
        setLoading(false);
      },
    );
  }, [projectId]);

  return (
    <ProjectContext.Provider
      value={{ project, environments, environmentId, setEnvironmentId, refreshEnvironments, loading }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext must be used within a ProjectProvider");
  return ctx;
}
