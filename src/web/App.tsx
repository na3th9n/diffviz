import { useEffect, useState, type ReactNode } from "react";
import type { AppState, ProjectInfo } from "../shared/types.ts";
import { fetchProjectInfo } from "./api.ts";
import { GraphArea } from "./components/GraphArea.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { useAppState, type Connection } from "./useAppState.ts";

// The App as served by `diffviz`: live state from the server over SSE.
export function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { state, connection } = useAppState();

  useEffect(() => {
    fetchProjectInfo().then(setProject, (error: unknown) => {
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  return <AppLayout project={project} loadError={loadError} state={state} connection={connection} />;
}

type AppLayoutProps = {
  project: ProjectInfo | null;
  loadError: string | null;
  state: AppState | null;
  connection: Connection;
  banner?: ReactNode;  // shown above the status bar; the demo site uses it
};

// The page itself: sidebar on the left, status bar and graph on the right.
// Shared by the live App and the read-only demo, so the demo looks exactly the same.
export function AppLayout({ project, loadError, state, connection, banner }: AppLayoutProps) {
  // The summary belongs to the graph: with a clean tree there is nothing to summarize.
  const graph = state?.graph ?? null;
  const summary = graph && !graph.isClean ? (graph.agentOutput?.summary ?? null) : null;

  return (
    <div className="app">
      <Sidebar project={project} loadError={loadError} summary={summary} />
      <main className="main">
        {banner}
        <StatusBar state={state} connection={connection} />
        <GraphArea state={state} />
      </main>
    </div>
  );
}
