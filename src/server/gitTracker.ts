import type { GitStatus, StatusError } from "../shared/types.ts";
import { checkRepo, getChanges, getHeadCommit } from "./git.ts";

const DIRTY_AT_LAUNCH: StatusError = {
  code: "dirtyAtLaunch",
  message:
    "There were uncommitted changes when diffviz started, so they are mixed into this session part. " +
    "Commit them to start a clean one.",
};

// Reads the project's git state and remembers what it needs between reads:
// which commit the current session part started from, which session part this
// is, and whether the tree was dirty at launch. Callers must not overlap
// readStatus() calls; ProjectState makes sure of that.
export class GitTracker {
  private readonly root: string;
  private baseCommit: string | null = null;
  private sessionPart = 0;
  private dirtyAtLaunch = false;

  constructor(root: string) {
    this.root = root;
  }

  async readStatus(): Promise<GitStatus> {
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
      this.sessionPart = 1;
    } else if (head !== this.baseCommit) {
      // HEAD moved to another commit, usually because of a commit: the session
      // part ended and a new one starts from here. (A checkout of a branch on a
      // different commit, or a reset, also lands here.)
      this.dirtyAtLaunch = false;
      this.sessionPart += 1;
    }
    this.baseCommit = head;

    return {
      kind: "ready",
      sessionPart: this.sessionPart,
      baseCommit: head,
      isClean,
      changes,
      errors: this.dirtyAtLaunch ? [DIRTY_AT_LAUNCH] : [],
    };
  }
}
