import type { FileChange, GraphEdge, GraphNode, GraphState, NodeStatus, StatusError } from "../shared/types.ts";
import type { ImportMap } from "./imports.ts";

const TYPESCRIPT_EXTENSIONS = /\.(ts|tsx|mts|cts)$/;

// TypeScript files get their imports parsed. Everything else, including
// .js files, is a plain node with no outgoing arrows in version 1.0.0.
export function isTypeScriptPath(filePath: string): boolean {
  return TYPESCRIPT_EXTENSIONS.test(filePath);
}

// Files whose imports should be resolved: changed TypeScript files that still exist.
export function filesToParse(changes: FileChange[]): string[] {
  return changes.filter((c) => c.change !== "deleted" && isTypeScriptPath(c.path)).map((c) => c.path);
}

type GraphInput = {
  sessionPart: number;
  baseCommit: string;
  isClean: boolean;
  errors: StatusError[];
  changes: FileChange[];
  imports: ImportMap;  // from resolveImports(filesToParse(changes))
};

// Builds the graph from git's changes and the resolved imports. Pure and
// deterministic: the same input always gives the same nodes and edges, in
// the same order. The agent's output is never used here.
export function buildGraphState(input: GraphInput): GraphState {
  const nodes = new Map<string, GraphNode>();
  for (const change of input.changes) {
    nodes.set(change.path, nodeForChange(change));
  }

  // Added after all changed files, so an import of a changed file points at
  // its changed node instead of creating a grayed-out duplicate.
  const edges = new Map<string, GraphEdge>();
  for (const [source, targets] of input.imports) {
    // Only changed or renamed TypeScript files have outgoing arrows; this is
    // what keeps the graph to one hop.
    const sourceNode = nodes.get(source);
    if (!sourceNode || sourceNode.status === "deleted" || sourceNode.status === "unchangedImport") continue;
    for (const target of targets) {
      if (target === source) continue;
      if (!nodes.has(target)) {
        nodes.set(target, { id: target, status: "unchangedImport", isTypeScript: isTypeScriptPath(target) });
      }
      const id = `${source}->${target}`;
      edges.set(id, { id, source, target });
    }
  }

  return {
    sessionPart: input.sessionPart,
    baseCommit: input.baseCommit,
    isClean: input.isClean,
    errors: input.errors,
    nodes: [...nodes.values()].sort(byId),
    edges: [...edges.values()].sort(byId),
    agentOutput: null,  // added by ProjectState after cross-checking current.json
  };
}

function nodeForChange(change: FileChange): GraphNode {
  const node: GraphNode = {
    id: change.path,
    status: nodeStatus(change),
    isTypeScript: isTypeScriptPath(change.path),
  };
  if (change.change === "renamed" && change.oldPath !== undefined) node.oldPath = change.oldPath;
  return node;
}

function nodeStatus(change: FileChange): NodeStatus {
  switch (change.change) {
    case "added":
    case "modified":
      return "changed";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
  }
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
