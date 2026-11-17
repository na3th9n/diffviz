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

// The git side of a refresh, used inside the server to build the GraphState.
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

// ---- Graph state (docs/SPEC.md, "Graph state") ----

// Everything the UI needs to draw one moment of a session part.
// The server sends the whole object on every update.
export type GraphState = {
  sessionPart: number;              // increments by 1 for each session part, starting at 1
  baseCommit: string;               // hash of the commit this session part started from
  isClean: boolean;                 // true when the git tree is clean; no graph is shown
  errors: StatusError[];            // shown in the status bar; empty when all is well
  nodes: GraphNode[];               // every changed file plus one hop of unchanged imports
  edges: GraphEdge[];               // imports between those files
  agentOutput: AgentOutput | null;  // filtered current.json; null until a valid one exists
};

// One file in the graph. Built from git and ts-morph only, never from the agent.
export type GraphNode = {
  id: string;             // relative path from the project root, normalized
  status: NodeStatus;     // sets the node's colour
  isTypeScript: boolean;  // sets the node's border style
  oldPath?: string;       // previous path; only present when status is "renamed"
};

// One import. Points from the file that imports to the file it imports.
export type GraphEdge = {
  id: string;      // `${source}->${target}`
  source: string;  // GraphNode id of the importing file
  target: string;  // GraphNode id of the imported file
};

// How a file changed since baseCommit.
export type NodeStatus =
  | "changed"          // added or modified
  | "unchangedImport"  // not changed, but imported by a changed file; drawn grayed out
  | "deleted"
  | "renamed";

// ---- Agent output (docs/SPEC.md, "Agent output") ----
// Plain types for now; the Zod schema that validates current.json comes in Part 5.

export type AgentOutput = {
  schemaVersion: number;          // starts at 1; bumped whenever this shape changes
  summary: string;                // cumulative summary of the session part, shown in the sidebar
  files: FileNote[];              // one description per file, shown as node tooltips
  layers: Layer[];                // groups of files, drawn as boxes around their nodes
  relationships: Relationship[];  // labels for import arrows, shown as arrow tooltips
};

export type FileNote = {
  path: string;         // relative path from the project root; must match a GraphNode id
  description: string;  // what changed in this file and why
};

export type Layer = {
  id: string;           // stable across rewrites of current.json; the agent reuses it
  name: string;         // label drawn above the box; may change between rewrites
  description: string;  // shown as the layer's tooltip
  paths: string[];      // files in this layer, by relative path
};

export type Relationship = {
  source: string;       // path of the importing file
  target: string;       // path of the imported file
  label: string;        // short label, e.g. "renders" or "fetches from"
  description: string;  // longer explanation, shown as the arrow's tooltip
};

// ---- What the server pushes to the UI ----

// Sent over Server-Sent Events on connect and after every refresh.
// `graph` is exactly the spec's GraphState; `repo` covers folders where
// no graph can be built at all.
export type AppState = {
  repo: "ready" | "notGitRepo" | "noCommits";
  graph: GraphState | null;  // null unless repo is "ready"
};
