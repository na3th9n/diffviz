import type { AppState, GitStatus } from "../shared/types.ts";
import { buildGraphState, filesToParse } from "./graph.ts";
import { GitTracker } from "./gitTracker.ts";
import { resolveImports } from "./imports.ts";

type Listener = (state: AppState) => void;

// Owns one full refresh of what the UI shows: read git, resolve the imports
// of the changed files, build the graph, then tell the listeners.
export class ProjectState {
  private readonly root: string;
  private readonly tracker: GitTracker;
  private state: AppState | null = null;
  private readonly listeners = new Set<Listener>();

  // Refreshes never overlap. A request that arrives during a refresh sets
  // `rerunRequested`, and the running loop does one more pass, so the last
  // change is always picked up. The loop covers the whole refresh, not just
  // git, so a slow graph build for an old change can never finish after a
  // newer one and overwrite it.
  private inFlight: Promise<AppState> | null = null;
  private rerunRequested = false;

  constructor(root: string) {
    this.root = root;
    this.tracker = new GitTracker(root);
  }

  // The latest state, or null before the first refresh finishes.
  getState(): AppState | null {
    return this.state;
  }

  // Calls `listener` after every refresh. Returns a function that unsubscribes.
  onUpdate(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Resolves with a state that reflects the files at, or after, the moment
  // refresh() was called.
  refresh(): Promise<AppState> {
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.inFlight;
    }
    this.inFlight = this.refreshLoop().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refreshLoop(): Promise<AppState> {
    let state: AppState;
    do {
      this.rerunRequested = false;
      state = toAppState(this.root, await this.tracker.readStatus());
      this.state = state;
      for (const listener of this.listeners) listener(state);
    } while (this.rerunRequested);
    return state;
  }
}

function toAppState(root: string, git: GitStatus): AppState {
  if (git.kind !== "ready") return { repo: git.kind, graph: null };
  const imports = resolveImports(root, filesToParse(git.changes));
  return {
    repo: "ready",
    graph: buildGraphState({
      sessionPart: git.sessionPart,
      baseCommit: git.baseCommit,
      isClean: git.isClean,
      errors: git.errors,
      changes: git.changes,
      imports,
    }),
  };
}
