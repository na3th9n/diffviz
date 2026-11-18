import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { FileFlowNode, ImportFlowEdge } from "./elements.ts";

const elk = new ELK();

// elkjs's "layered" algorithm puts each file in a column so that most arrows
// point the same way. Direction RIGHT puts importers left of what they import,
// so the graph reads left to right like the mockup: UI → API → services → shared.
const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  // Same input, same picture: keeps nodes from jumping around between updates.
  "elk.randomSeed": "1",
};

// Returns copies of `nodes` with positions filled in. Edges are only used to
// decide placement; React Flow draws them between the placed nodes.
export async function layoutGraph(nodes: FileFlowNode[], edges: ImportFlowEdge[]): Promise<FileFlowNode[]> {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };
  const result = await elk.layout(graph);

  const positions = new Map((result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]));
  return nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position) throw new Error(`elkjs returned no position for ${node.id}`);
    return { ...node, position };
  });
}
