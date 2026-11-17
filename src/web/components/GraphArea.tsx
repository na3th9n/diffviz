import type { GitStatus } from "../../shared/types.ts";

// The graph view. Until the graph is drawn (Part 4), it shows a message
// for each state the project can be in.
export function GraphArea({ status }: { status: GitStatus | null }) {
  const message = emptyMessage(status);
  return (
    <div className="graph-area">
      <div className="empty-state">
        <p className="empty-title">{message.title}</p>
        <p className="empty-body">{message.body}</p>
      </div>
    </div>
  );
}

function emptyMessage(status: GitStatus | null): { title: string; body: string } {
  if (status === null) return { title: "Connecting…", body: "Waiting for the diffviz server." };
  switch (status.kind) {
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
      if (status.isClean) {
        return { title: "No changes yet", body: "Changes since the last commit will appear here as a graph." };
      }
      return {
        title: `${status.changes.length} changed ${status.changes.length === 1 ? "file" : "files"}`,
        body: "The graph of these changes is drawn in a later part.",
      };
  }
}
