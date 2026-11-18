import type { Edge, Node } from "@xyflow/react";
import type { GraphNode, GraphState, NodeStatus } from "../../shared/types.ts";

// Node size from the spec's Visual design section. elkjs needs it to lay out
// the graph before React Flow has drawn anything.
export const NODE_WIDTH = 188;
export const NODE_HEIGHT = 40;

// How many characters of JetBrains Mono 12px fit in a node: 188px minus 2×10px
// padding, at about 7.2px per character. A "renamed" tag takes about 7 more.
const MAX_LABEL_CHARS = 23;
const RENAMED_TAG_CHARS = 7;

export type Tooltip = {
  title: string;  // short accent-coloured label
  body: string;
};

export type FileNodeData = {
  path: string;            // the GraphNode id: full project path
  label: string;           // what the node shows: a short, unique ending of the path
  status: NodeStatus;
  isTypeScript: boolean;
  tooltip: Tooltip | null; // null: no tooltip on hover
};

export type ImportEdgeData = {
  toUnchanged: boolean;    // points at a grayed-out node, so it is drawn dimmer
};

export type FileFlowNode = Node<FileNodeData, "file">;
export type ImportFlowEdge = Edge<ImportEdgeData, "import">;

// Converts the server's GraphState into React Flow nodes and edges, without
// positions; layoutGraph() adds those.
export function toFlowElements(graph: GraphState): { nodes: FileFlowNode[]; edges: ImportFlowEdge[] } {
  const labels = nodeLabels(graph.nodes.map((node) => node.id));
  const statusById = new Map(graph.nodes.map((node) => [node.id, node.status]));

  const nodes = graph.nodes.map((node): FileFlowNode => ({
    id: node.id,
    type: "file",
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: {
      path: node.id,
      label: fitLabel(labels.get(node.id) ?? node.id, node.status === "renamed"),
      status: node.status,
      isTypeScript: node.isTypeScript,
      tooltip: tooltipFor(node),
    },
  }));

  const edges = graph.edges.map((edge): ImportFlowEdge => ({
    id: edge.id,
    type: "import",
    source: edge.source,
    target: edge.target,
    data: { toUnchanged: statusById.get(edge.target) === "unchangedImport" },
  }));

  return { nodes, edges };
}

// Picks the shortest ending of each path that no other path shares:
// "src/App.tsx" shows as "App.tsx", but "components/index.ts" and
// "utils/index.ts" keep a folder each so they can be told apart.
export function nodeLabels(paths: string[]): Map<string, string> {
  const parts = new Map(paths.map((p) => [p, p.split("/")]));
  const depth = new Map(paths.map((p) => [p, 1]));
  const ending = (p: string) => parts.get(p)!.slice(-depth.get(p)!).join("/");

  // Each pass gives every clashing path one more folder. Depths only grow and
  // are capped at the full path, so this always stops.
  let changed = true;
  while (changed) {
    changed = false;
    const byEnding = new Map<string, string[]>();
    for (const p of paths) {
      const key = ending(p);
      byEnding.set(key, [...(byEnding.get(key) ?? []), p]);
    }
    for (const group of byEnding.values()) {
      if (group.length < 2) continue;
      for (const p of group) {
        if (depth.get(p)! < parts.get(p)!.length) {
          depth.set(p, depth.get(p)! + 1);
          changed = true;
        }
      }
    }
  }
  return new Map(paths.map((p) => [p, ending(p)]));
}

// Shortens a label that does not fit, cutting from the left so the file name stays.
export function fitLabel(label: string, hasRenamedTag: boolean): string {
  const max = MAX_LABEL_CHARS - (hasRenamedTag ? RENAMED_TAG_CHARS : 0);
  return label.length <= max ? label : "…" + label.slice(-(max - 1));
}

// Tooltips that come from git, so they are always accurate. Changed files get
// the agent's description in Part 5; grayed-out imports never have a tooltip.
export function tooltipFor(node: GraphNode): Tooltip | null {
  switch (node.status) {
    case "deleted":
      return { title: node.id, body: "This file has been deleted." };
    case "renamed":
      return { title: node.id, body: `Renamed from ${node.oldPath ?? "an unknown path"}.` };
    case "changed":
    case "unchangedImport":
      return null;
  }
}
