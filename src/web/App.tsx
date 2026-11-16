import { useEffect, useState } from "react";
import type { ProjectInfo } from "../shared/types.ts";
import { fetchProjectInfo } from "./api.ts";
import { GraphArea } from "./components/GraphArea.tsx";
import { Sidebar } from "./components/Sidebar.tsx";

export function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjectInfo().then(setProject, (error: unknown) => {
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  return (
    <div className="app">
      <Sidebar project={project} loadError={loadError} />
      <main className="main">
        <GraphArea />
      </main>
    </div>
  );
}
