import type { GitStatus, StatusError } from "../shared/types.ts";
import { checkRepo, getChanges, getHeadCommit } from "./git.ts";

type Listener = (status: GitStatus) => void;

const DIRTY_AT_LAUNCH: StatusError = {
  code: "dirtyAtLaunch",
  message:
    "There were uncommitted changes when diffviz started, so they are mixed into this session part. " +
    "Commit them to start a clean one.",
};

// Keeps the git state of the project between refreshes: which commit the
// current session part started from, and whether the tree was dirty at launch.
export class GitTracker {
  private readonly root: string;
  private status: GitStatus | null = null;
  private baseCommit: string | null = null;
  private dirtyAtLaunch = false;
  private readonly listeners = new Set<Listener>();

  // Refreshes never overlap. A request that arrives during a refresh sets
  // `rerunRequested`, and the running loop does one more pass, so the last
  // change is always picked up without running git several times at once.
  private inFlight: Promise<GitStatus> | null = null;
  private rerunRequested = false;

  constructor(root: string) {
    this.root = root;
  }

  // The latest status, or null before the first refresh finishes.
  getStatus(): GitStatus | null {
    return this.status;
  }

  // Calls `listener` after every refresh. Returns a function that unsubscribes.
  onUpdate(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Re-reads git. Resolves with a status that reflects the files at, or after,
  // the moment refresh() was called.
  refresh(): Promise<GitStatus> {
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.inFlight;
    }
    this.inFlight = this.refreshLoop().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refreshLoop(): Promise<GitStatus> {
    let status: GitStatus;
    do {
      this.rerunRequested = false;
      status = await this.readStatus();
      this.status = status;
      for (const listener of this.listeners) listener(status);
    } while (this.rerunRequested);
    return status;
  }

  private async readStatus(): Promise<GitStatus> {
    const repo = await checkRepo(this.root);
    if (repo !== "ready") return { kind: repo };

    const head = await getHeadCommit(this.root);
    if (head === null) return { kind: "noCommits" };  // commits removed between the two calls
    const changes = await getChanges(this.root);
    const isClean = changes.length === 0;

    if (this.baseCommit === null) {
      // First time this folder is a usable repo: normally at launch, or after the
      // user runs `git init` and makes a first commit while the App is open.
      this.dirtyAtLaunch = !isClean;
    } else if (head !== this.baseCommit) {
      // HEAD moved, usually because of a commit: the session part ended and a new
      // one starts from this commit. (A branch checkout or reset also lands here.)
      this.dirtyAtLaunch = false;
    }
    this.baseCommit = head;

    return {
      kind: "ready",
      baseCommit: head,
      isClean,
      changes,
      errors: this.dirtyAtLaunch ? [DIRTY_AT_LAUNCH] : [],
    };
  }
}
