import type { AppState } from "../../shared/types.ts";
import { GraphView } from "./GraphView.tsx";

// The graph view when there are changes, and a message for every other state.
export function GraphArea({ state }: { state: AppState | null }) {
  const graph = state?.repo === "ready" ? state.graph : null;
  if (graph && !graph.isClean) return <GraphView graph={graph} />;

  const message = emptyMessage(state);
  return (
    <div className="graph-area">
      <div className="empty-state">
        <p className="empty-title">{message.title}</p>
        <p className="empty-body">{message.body}</p>
      </div>
    </div>
  );
}

function emptyMessage(state: AppState | null): { title: string; body: string } {
  if (state === null) return { title: "Connecting…", body: "Waiting for the diffviz server." };
  switch (state.repo) {
    case "notGitRepo":
      return {
        title: "This folder is not a git repository",
        body: "diffviz builds its graph from git, so it can't draw one here. Run git init and make a first commit.",
      };
    case "noCommits":
      return {
        title: "This repository has no commits yet",
        body: "diffviz compares your changes against the last commit. Make a first commit to start.",
      };
    case "ready":
      return { title: "No changes yet", body: "Changes since the last commit will appear here as a graph." };
  }
}
