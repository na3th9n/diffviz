import { useEffect, useState } from "react";
import type { ProjectInfo } from "../shared/types.ts";
import { fetchProjectInfo } from "./api.ts";
import { GraphArea } from "./components/GraphArea.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { useAppState } from "./useAppState.ts";

export function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { state, connection } = useAppState();
  // The summary belongs to the graph: with a clean tree there is nothing to summarize.
  const graph = state?.graph ?? null;
  const summary = graph && !graph.isClean ? (graph.agentOutput?.summary ?? null) : null;

  useEffect(() => {
    fetchProjectInfo().then(setProject, (error: unknown) => {
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  return (
    <div className="app">
      <Sidebar project={project} loadError={loadError} summary={summary} />
      <main className="main">
        <StatusBar state={state} connection={connection} />
        <GraphArea state={state} />
      </main>
    </div>
  );
}
