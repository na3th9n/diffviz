import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";
import type { GraphFlowNode, ImportFlowEdge } from "./elements.ts";

const elk = new ELK();

// Room inside a layer box: the layer's name sits in the top strip
// (LAYER_LABEL_HEIGHT), then the box's own padding around its files.
export const LAYER_LABEL_HEIGHT = 24;
const LAYER_PADDING = 24;

// elkjs's "layered" algorithm puts each file in a column so that most arrows
// point the same way. Direction RIGHT puts importers left of what they import,
// so the graph reads left to right like the mockup: UI → API → services → shared.
const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  // Lay out the files inside layer boxes together with everything else, so an
  // arrow between two layers still runs left to right across the whole graph.
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  // Same input, same picture: keeps nodes from jumping around between updates.
  "elk.randomSeed": "1",
};

const LAYER_OPTIONS: Record<string, string> = {
  "elk.padding": `[top=${LAYER_LABEL_HEIGHT + LAYER_PADDING},left=${LAYER_PADDING},bottom=${LAYER_PADDING},right=${LAYER_PADDING}]`,
};

// Returns copies of `nodes` with positions filled in, and sizes for layer
// boxes. A file inside a layer gets a position relative to its layer box,
// which is what React Flow expects for a node with a parentId. Edges are only
// used to decide placement; React Flow draws them between the placed nodes.
export async function layoutGraph(nodes: GraphFlowNode[], edges: ImportFlowEdge[]): Promise<GraphFlowNode[]> {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId ?? null]));

  const elkNodes = new Map<string, ElkNode>();
  for (const node of nodes) {
    elkNodes.set(node.id, node.type === "layer"
      ? { id: node.id, layoutOptions: LAYER_OPTIONS, children: [], edges: [] }
      : { id: node.id, width: node.width, height: node.height });
  }

  const root: ElkNode = { id: "root", layoutOptions: LAYOUT_OPTIONS, children: [], edges: [] };
  for (const node of nodes) {
    const parent = node.parentId ? elkNodes.get(node.parentId) : root;
    if (!parent) throw new Error(`${node.id} is in a layer that does not exist: ${node.parentId}`);
    parent.children!.push(elkNodes.get(node.id)!);
  }

  // elkjs wants each edge in the box that contains both of its ends.
  for (const edge of edges) {
    const elkEdge: ElkExtendedEdge = { id: edge.id, sources: [edge.source], targets: [edge.target] };
    const sameParent = parentOf.get(edge.source) === parentOf.get(edge.target) ? parentOf.get(edge.source) : null;
    const container = sameParent ? elkNodes.get(sameParent)! : root;
    container.edges!.push(elkEdge);
  }

  const result = await elk.layout(root);

  const placed = new Map<string, ElkNode>();
  const collect = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      placed.set(child.id, child);
      collect(child);
    }
  };
  collect(result);

  return nodes.map((node) => {
    const box = placed.get(node.id);
    if (!box || box.x === undefined || box.y === undefined) throw new Error(`elkjs returned no position for ${node.id}`);
    const position = { x: box.x, y: box.y };
    if (node.type === "layer") return { ...node, position, width: box.width, height: box.height };
    return { ...node, position };
  });
}
