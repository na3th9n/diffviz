import type { AppState, StatusError } from "../../shared/types.ts";
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
  const activity = activityText(state);
  return (
    <div className="status-bar">
      <div className="status-left">{connection === "lost" ? <Disconnected /> : <State state={state} />}</div>
      {(errors.length > 0 || activity) && (
        <div className="status-right">
          {activity && <span className="muted">{activity}</span>}
          {errors.map((error) => (
            <span key={error.code} className="status-error" title={error.message}>
              {errorLabel(error)}
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

// "AI output updated after prompt 2", as in the mockup. Prompts are counted by
// the Claude Code hooks; without them there is nothing to show.
function activityText(state: AppState | null): string | null {
  const activity = state?.activity;
  if (!activity || state?.graph?.isClean) return null;
  if (activity.aiOutputAfterPrompt !== null) {
    // 0: written before any prompt was logged, e.g. before the hooks were set up.
    return activity.aiOutputAfterPrompt > 0 ? `AI output updated after prompt ${activity.aiOutputAfterPrompt}` : "AI output updated";
  }
  if (activity.promptCount > 0) return `${activity.promptCount} ${activity.promptCount === 1 ? "prompt" : "prompts"}, no AI output yet`;
  return null;
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

// The full message is always on hover (the title attribute).
function errorLabel(error: StatusError): string {
  switch (error.code) {
    case "dirtyAtLaunch":
      return "Uncommitted changes at launch: commit to start clean";
    case "aiOutputMissing":
      return "AI output missing: labels may be out of date";
    case "aiOutputInvalid":
      // The reason is the useful part, so it is shown, not just hovered.
      return `AI output invalid: ${reasonOf(error.message)}`;
  }
}

// The server's message is "<what happened>: <reason>"; show just the reason.
function reasonOf(message: string): string {
  const colon = message.indexOf(": ");
  return colon === -1 ? message : message.slice(colon + 2);
}
