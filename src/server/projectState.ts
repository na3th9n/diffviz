import type { AppState, GraphState } from "../shared/types.ts";
import { AgentOutputTracker } from "./agentState.ts";
import { crossCheck } from "./crossCheck.ts";
import { getHeadCommit, getTreeFingerprint } from "./git.ts";
import { buildGraphState, filesToParse } from "./graph.ts";
import { GitTracker } from "./gitTracker.ts";
import { resolveImports } from "./imports.ts";
import { saveFinalGraph, SessionLog } from "./sessionLog.ts";

type Listener = (state: AppState) => void;

// Owns one full refresh of what the UI shows: read git and current.json,
// resolve the imports of the changed files, build the graph, label it with
// the cross-checked agent output, then tell the listeners. It also records the
// session part's history: prompts and responses from the Claude Code hooks,
// each saved current.json version, and the final graph when a commit ends it.
export class ProjectState {
  private readonly root: string;
  private readonly tracker: GitTracker;
  private readonly agent: AgentOutputTracker;
  private readonly log: SessionLog;
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
    this.log = new SessionLog(root);
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

  // The user sent a prompt (the UserPromptSubmit hook).
  async promptSubmitted(text: string, sessionId: string | null): Promise<AppState> {
    // Logged straight away, before anything the agent does in reply can be
    // read. It goes in the session part of the commit HEAD is on now, so a
    // prompt sent just after a commit belongs to the new part even if the App
    // hasn't refreshed since.
    const head = await headCommitOrNull(this.root);
    if (head === null) return this.refresh();  // not a usable repository: nothing to log to
    await this.log.startPart(head);
    await this.log.logPrompt(text, sessionId);
    return this.refresh();
  }

  // The agent finished a response (the Stop hook). `text` is its reply, read
  // from the transcript, when the hook could find it. Resolves with the state
  // after the agent's output has been checked for this turn.
  async agentFinished(text: string | null = null, sessionId: string | null = null): Promise<AppState> {
    // The agent usually writes current.json just before it finishes, and the
    // watcher waits a moment before refreshing. Refreshing first makes sure
    // that write has been read, or it would wrongly look missing.
    const before = await this.refresh();
    if (before.repo !== "ready") return before;
    await this.log.logResponse(text, sessionId);
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
    if (git.kind !== "ready") return { repo: git.kind, graph: null, activity: null };

    const previous = this.state?.graph ?? null;
    if (previous && previous.baseCommit !== git.baseCommit) await this.endPart(previous, git.baseCommit);
    await this.log.startPart(git.baseCommit);

    const savedVersion = await this.agent.update(git.baseCommit, () => getTreeFingerprint(this.root));
    if (savedVersion !== null) await this.log.logAiOutput(savedVersion);

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
    const activity = this.log.activity();
    const rawOutput = this.agent.output();
    if (rawOutput === null) return { repo: "ready", graph: { ...graph, errors }, activity };

    const { output, warnings } = crossCheck(rawOutput, graph.nodes, graph.edges);
    this.logWarnings(warnings);
    return { repo: "ready", graph: { ...graph, errors, agentOutput: output }, activity };
  }

  // HEAD moved: the session part that `last` belongs to is over. Its last graph
  // is saved next to its versions and log. A part with no changes left nothing
  // to save.
  private async endPart(last: GraphState, newBase: string): Promise<void> {
    if (last.isClean) return;
    try {
      await saveFinalGraph(this.root, last, newBase);
    } catch (error) {
      // Losing the saved copy must not stop the new session part from starting.
      console.error("diffviz: could not save the final graph of the session part:", error);
    }
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

async function headCommitOrNull(root: string): Promise<string | null> {
  try {
    return await getHeadCommit(root);
  } catch {
    return null;  // not a git repository (any more)
  }
}
