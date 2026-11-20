import type { Edge, Node } from "@xyflow/react";
import type { FileNote, GraphNode, GraphState, Layer, NodeStatus, Relationship } from "../../shared/types.ts";

// Node size from the spec's Visual design section. elkjs needs it to lay out
// the graph before React Flow has drawn anything.
export const NODE_WIDTH = 188;
export const NODE_HEIGHT = 40;

// How many characters of JetBrains Mono 12px fit in a node: 188px minus 2×10px
// padding, at about 7.2px per character. A "renamed" tag takes about 7 more.
const MAX_LABEL_CHARS = 23;
const RENAMED_TAG_CHARS = 7;

export type Tooltip = {
  title: string;     // short accent-coloured label
  titleIsPath: boolean;  // file paths are shown in the monospace font
  body: string[];    // one entry per paragraph
};

export type FileNodeData = {
  path: string;            // the GraphNode id: full project path
  label: string;           // what the node shows: a short, unique ending of the path
  status: NodeStatus;
  isTypeScript: boolean;
  tooltip: Tooltip | null; // null: no tooltip on hover
};

export type LayerNodeData = {
  name: string;
  tooltip: Tooltip;
};

export type ImportEdgeData = {
  toUnchanged: boolean;     // points at a grayed-out node, so it is drawn dimmer
  tooltip: Tooltip | null;  // the agent's label for this import, if it gave one
};

export type FileFlowNode = Node<FileNodeData, "file">;
export type LayerFlowNode = Node<LayerNodeData, "layer">;
export type GraphFlowNode = FileFlowNode | LayerFlowNode;
export type ImportFlowEdge = Edge<ImportEdgeData, "import">;

// Stacking order, back to front. React Flow's own rule draws arrows between
// files inside layer boxes above files outside them; with zIndexMode "manual"
// (GraphView) these fixed values apply instead.
export const LAYER_Z = 0;
export const EDGE_Z = 1;
export const FILE_Z = 2;

// Layer boxes share the node list with files, so their ids get a prefix.
export const LAYER_ID_PREFIX = "layer:";
export const layerNodeId = (layerId: string) => LAYER_ID_PREFIX + layerId;

// Converts the server's GraphState into React Flow nodes and edges, without
// positions; layoutGraph() adds those. The agent's output (already
// cross-checked by the server) adds layer boxes and tooltips; without it the
// graph is the same, just unlabelled.
export function toFlowElements(graph: GraphState): { nodes: GraphFlowNode[]; edges: ImportFlowEdge[] } {
  const output = graph.agentOutput;
  const labels = nodeLabels(graph.nodes.map((node) => node.id));
  const statusById = new Map(graph.nodes.map((node) => [node.id, node.status]));
  const noteByPath = new Map((output?.files ?? []).map((note) => [note.path, note]));
  const relationshipById = new Map((output?.relationships ?? []).map((r) => [`${r.source}->${r.target}`, r]));
  const layers = output?.layers ?? [];
  const layerOfPath = new Map(layers.flatMap((layer) => layer.paths.map((p) => [p, layerNodeId(layer.id)] as const)));

  // React Flow needs a parent before its children in the list.
  const layerNodes = layers.map(layerNode);
  const fileNodes = graph.nodes.map((node): FileFlowNode => {
    const parentId = layerOfPath.get(node.id);
    return {
      id: node.id,
      type: "file",
      position: { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      zIndex: FILE_Z,
      ...(parentId !== undefined && { parentId }),
      data: {
        path: node.id,
        label: fitLabel(labels.get(node.id) ?? node.id, node.status === "renamed"),
        status: node.status,
        isTypeScript: node.isTypeScript,
        tooltip: tooltipFor(node, noteByPath.get(node.id)),
      },
    };
  });

  const edges = graph.edges.map((edge): ImportFlowEdge => ({
    id: edge.id,
    type: "import",
    source: edge.source,
    target: edge.target,
    zIndex: EDGE_Z,
    data: {
      toUnchanged: statusById.get(edge.target) === "unchangedImport",
      tooltip: relationshipTooltip(relationshipById.get(edge.id)),
    },
  }));

  return { nodes: [...layerNodes, ...fileNodes], edges };
}

// A layer box. Its size depends on its files, so layoutGraph() sets it.
function layerNode(layer: Layer): LayerFlowNode {
  return {
    id: layerNodeId(layer.id),
    type: "layer",
    position: { x: 0, y: 0 },
    zIndex: LAYER_Z,
    data: {
      name: layer.name,
      tooltip: { title: layer.name, titleIsPath: false, body: paragraphs(layer.description) },
    },
  };
}

function relationshipTooltip(relationship: Relationship | undefined): Tooltip | null {
  if (!relationship) return null;
  return { title: relationship.label, titleIsPath: false, body: paragraphs(relationship.description) };
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

// A file's tooltip. Deleted and renamed files always say so, from git, so that
// part is always accurate; the agent's description follows when there is one.
// Grayed-out imports never have a tooltip: the agent didn't change them.
export function tooltipFor(node: GraphNode, note?: FileNote): Tooltip | null {
  const description = note ? paragraphs(note.description) : [];
  const tooltip = (body: string[]): Tooltip | null =>
    body.length === 0 ? null : { title: node.id, titleIsPath: true, body };

  switch (node.status) {
    case "deleted":
      return tooltip(["This file has been deleted.", ...description]);
    case "renamed":
      return tooltip([`Renamed from ${node.oldPath ?? "an unknown path"}.`, ...description]);
    case "changed":
      return tooltip(description);
    case "unchangedImport":
      return null;
  }
}

// Splits text into paragraphs at blank lines, dropping empty ones.
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}
