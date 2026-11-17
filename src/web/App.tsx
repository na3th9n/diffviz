import { useEffect, useState } from "react";
import type { ProjectInfo } from "../shared/types.ts";
import { fetchProjectInfo } from "./api.ts";
import { GraphArea } from "./components/GraphArea.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { useGitStatus } from "./useGitStatus.ts";

export function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { status, connection } = useGitStatus();

  useEffect(() => {
    fetchProjectInfo().then(setProject, (error: unknown) => {
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  return (
    <div className="app">
      <Sidebar project={project} loadError={loadError} />
      <main className="main">
        <StatusBar status={status} connection={connection} />
        <GraphArea status={status} />
      </main>
    </div>
  );
}
