// Types shared by the server and the UI.

// The project the App was launched in, shown at the top of the sidebar.
export type ProjectInfo = {
  name: string;         // folder name, e.g. "job-tracker"
  displayPath: string;  // absolute path, with the home directory shown as "~"
};

// One message in the status bar. Matches StatusError in docs/SPEC.md.
export type StatusError = {
  code:
    | "dirtyAtLaunch"     // the tree had uncommitted changes when the App started
    | "aiOutputMissing"   // the agent finished and code changed, but current.json did not
    | "aiOutputInvalid";  // current.json failed Zod validation
  message: string;        // human-readable details
};

// How one file differs from the last commit, as reported by git.
export type ChangeKind = "added" | "modified" | "deleted" | "renamed";

export type FileChange = {
  path: string;      // relative to the project root, forward slashes
  change: ChangeKind;
  oldPath?: string;  // only present when change is "renamed"
};

// The git side of the App's state, pushed to the UI over Server-Sent Events.
// Not part of the spec's GraphState: it also covers folders where no graph
// can be built at all ("notGitRepo" and "noCommits").
export type GitStatus =
  | {
      kind: "ready";
      baseCommit: string;      // hash of the commit the session part started from
      isClean: boolean;        // true when nothing differs from baseCommit
      changes: FileChange[];
      errors: StatusError[];
    }
  | { kind: "notGitRepo" }
  | { kind: "noCommits" };
