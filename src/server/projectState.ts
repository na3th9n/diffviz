import type { AppState } from "../shared/types.ts";
import { AgentOutputTracker } from "./agentState.ts";
import { crossCheck } from "./crossCheck.ts";
import { getTreeFingerprint } from "./git.ts";
import { buildGraphState, filesToParse } from "./graph.ts";
import { GitTracker } from "./gitTracker.ts";
import { resolveImports } from "./imports.ts";

type Listener = (state: AppState) => void;

// Owns one full refresh of what the UI shows: read git and current.json,
// resolve the imports of the changed files, build the graph, label it with
// the cross-checked agent output, then tell the listeners.
export class ProjectState {
  private readonly root: string;
  private readonly tracker: GitTracker;
  private readonly agent: AgentOutputTracker;
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
    this.agent = new AgentOutputTracker(root);
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

  // Called when the agent finishes a response. Resolves with the state after
  // the agent's output has been checked for this turn.
  async agentFinished(): Promise<AppState> {
    // The agent usually writes current.json just before it finishes, and the
    // watcher waits a moment before refreshing. Refreshing first makes sure
    // that write has been read, or it would wrongly look missing.
    const before = await this.refresh();
    if (before.repo !== "ready") return before;
    this.agent.finishTurn(await getTreeFingerprint(this.root));
    return this.refresh();
  }

  private async refreshLoop(): Promise<AppState> {
    let state: AppState;
    do {
      this.rerunRequested = false;
      state = await this.buildState();
      this.state = state;
      for (const listener of this.listeners) listener(state);
    } while (this.rerunRequested);
    return state;
  }

  private async buildState(): Promise<AppState> {
    const git = await this.tracker.readStatus();
    if (git.kind !== "ready") return { repo: git.kind, graph: null };

    await this.agent.update(git.baseCommit, () => getTreeFingerprint(this.root));
    const imports = resolveImports(this.root, filesToParse(git.changes));
    const graph = buildGraphState({
      sessionPart: git.sessionPart,
      baseCommit: git.baseCommit,
      isClean: git.isClean,
      errors: git.errors,
      changes: git.changes,
      imports,
    });

    const errors = [...graph.errors, ...this.agent.errors()];
    const rawOutput = this.agent.output();
    if (rawOutput === null) return { repo: "ready", graph: { ...graph, errors } };

    const { output, warnings } = crossCheck(rawOutput, graph.nodes, graph.edges);
    this.logWarnings(warnings);
    return { repo: "ready", graph: { ...graph, errors, agentOutput: output } };
  }

  // The same output is cross-checked on every refresh, so only log the
  // warnings when they change, not on every file save.
  private lastWarnings = "";
  private logWarnings(warnings: string[]): void {
    const key = warnings.join("\n");
    if (key === this.lastWarnings) return;
    this.lastWarnings = key;
    for (const warning of warnings) console.warn(`diffviz: ignored part of current.json: ${warning}`);
  }
}
