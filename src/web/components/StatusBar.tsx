import type { GitStatus } from "../../shared/types.ts";
import type { Connection } from "../useGitStatus.ts";

type StatusBarProps = {
  status: GitStatus | null;
  connection: Connection;
};

type Tone = "idle" | "active" | "warning" | "error";

// The bar above the graph: the session part's state on the left,
// warnings and named errors on the right.
export function StatusBar({ status, connection }: StatusBarProps) {
  const errors = status?.kind === "ready" ? status.errors : [];
  return (
    <div className="status-bar">
      <div className="status-left">{connection === "lost" ? <Disconnected /> : <State status={status} />}</div>
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

function State({ status }: { status: GitStatus | null }) {
  if (status === null) return <Indicator tone="idle" label="Connecting…" />;
  switch (status.kind) {
    case "notGitRepo":
      return <Indicator tone="error" label="Not a git repository" />;
    case "noCommits":
      return <Indicator tone="warning" label="No commits yet" />;
    case "ready": {
      const commit = <span className="mono">{status.baseCommit.slice(0, 7)}</span>;
      if (status.isClean) {
        return (
          <>
            <Indicator tone="idle" label="No changes" />
            <span className="muted">Clean since {commit}</span>
          </>
        );
      }
      const count = status.changes.length;
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
