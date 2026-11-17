import type { AppState } from "../../shared/types.ts";
import type { Connection } from "../useAppState.ts";

type StatusBarProps = {
  state: AppState | null;
  connection: Connection;
};

type Tone = "idle" | "active" | "warning" | "error";

// The bar above the graph: the session part's state on the left,
// warnings and named errors on the right.
export function StatusBar({ state, connection }: StatusBarProps) {
  const errors = state?.graph?.errors ?? [];
  return (
    <div className="status-bar">
      <div className="status-left">{connection === "lost" ? <Disconnected /> : <State state={state} />}</div>
      {errors.length > 0 && (
        <div className="status-right">
          {errors.map((error) => (
            <span key={error.code} className="status-error" title={error.message}>
              {errorLabel(error.code)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function State({ state }: { state: AppState | null }) {
  if (state === null) return <Indicator tone="idle" label="Connecting…" />;
  switch (state.repo) {
    case "notGitRepo":
      return <Indicator tone="error" label="Not a git repository" />;
    case "noCommits":
      return <Indicator tone="warning" label="No commits yet" />;
    case "ready": {
      const graph = state.graph;
      if (graph === null) return null;  // the server always sends a graph when the repo is ready
      const commit = <span className="mono">{graph.baseCommit.slice(0, 7)}</span>;
      if (graph.isClean) {
        return (
          <>
            <Indicator tone="idle" label="No changes" />
            <span className="muted">Clean since {commit}</span>
          </>
        );
      }
      // Grayed-out imports are in the graph but were not changed, so they are not counted.
      const count = graph.nodes.filter((node) => node.status !== "unchangedImport").length;
      return (
        <>
          <Indicator tone="active" label="Session part in progress" />
          <span className="muted">
            {count} {count === 1 ? "file" : "files"} changed since {commit}
          </span>
        </>
      );
    }
  }
}

function Disconnected() {
  return <Indicator tone="error" label="Disconnected from diffviz, retrying…" />;
}

function Indicator({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="indicator">
      <span className={`dot dot-${tone}`} />
      {label}
    </span>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "dirtyAtLaunch":
      return "Uncommitted changes at launch: commit to start clean";
    default:
      return code;
  }
}
