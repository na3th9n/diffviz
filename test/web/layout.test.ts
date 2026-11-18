import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH, toFlowElements, type GraphFlowNode } from "../../src/web/graph/elements.ts";
import { LAYER_LABEL_HEIGHT, layoutGraph } from "../../src/web/graph/layout.ts";
import type { GraphState } from "../../src/shared/types.ts";

// A small graph shaped like a job-tracker change: a page importing an API
// client and a shared package, which a server route also imports.
const graph: GraphState = {
  sessionPart: 1,
  baseCommit: "abc1234",
  isClean: false,
  errors: [],
  agentOutput: null,
  nodes: [
    { id: "web/DashboardPage.tsx", status: "changed", isTypeScript: true },
    { id: "web/api/client.ts", status: "unchangedImport", isTypeScript: true },
    { id: "web/Dashboard.module.css", status: "unchangedImport", isTypeScript: false },
    { id: "server/routes/emails.ts", status: "changed", isTypeScript: true },
    { id: "shared/index.ts", status: "changed", isTypeScript: true },
    { id: "server/old.ts", status: "deleted", isTypeScript: true },
  ],
  edges: [
    { id: "web/DashboardPage.tsx->web/api/client.ts", source: "web/DashboardPage.tsx", target: "web/api/client.ts" },
    { id: "web/DashboardPage.tsx->web/Dashboard.module.css", source: "web/DashboardPage.tsx", target: "web/Dashboard.module.css" },
    { id: "web/DashboardPage.tsx->shared/index.ts", source: "web/DashboardPage.tsx", target: "shared/index.ts" },
    { id: "server/routes/emails.ts->shared/index.ts", source: "server/routes/emails.ts", target: "shared/index.ts" },
  ],
};

async function layOut(input: GraphState = graph): Promise<Map<string, GraphFlowNode>> {
  const { nodes, edges } = toFlowElements(input);
  const placed = await layoutGraph(nodes, edges);
  return new Map(placed.map((node) => [node.id, node]));
}

function overlaps(a: GraphFlowNode, b: GraphFlowNode): boolean {
  return (
    a.position.x < b.position.x + NODE_WIDTH &&
    b.position.x < a.position.x + NODE_WIDTH &&
    a.position.y < b.position.y + NODE_HEIGHT &&
    b.position.y < a.position.y + NODE_HEIGHT
  );
}

describe("layoutGraph", () => {
  it("gives every node a position, including a node with no arrows", async () => {
    const placed = await layOut();
    expect([...placed.keys()].sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    for (const node of placed.values()) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it("never places two nodes on top of each other", async () => {
    const nodes = [...(await layOut()).values()];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(overlaps(nodes[i]!, nodes[j]!), `${nodes[i]!.id} overlaps ${nodes[j]!.id}`).toBe(false);
      }
    }
  });

  it("places every importer to the left of the file it imports", async () => {
    const placed = await layOut();
    for (const edge of graph.edges) {
      expect(placed.get(edge.source)!.position.x, edge.id).toBeLessThan(placed.get(edge.target)!.position.x);
    }
  });

  it("gives the same positions for the same graph", async () => {
    const first = await layOut();
    const second = await layOut();
    for (const [id, node] of first) expect(second.get(id)!.position).toEqual(node.position);
  });

  it("handles an empty graph", async () => {
    expect(await layoutGraph([], [])).toEqual([]);
  });
});

describe("layoutGraph with layer boxes", () => {
  const withLayers: GraphState = {
    ...graph,
    agentOutput: {
      schemaVersion: 1,
      summary: "",
      files: [],
      layers: [
        { id: "ui", name: "UI", description: "", paths: ["web/DashboardPage.tsx", "web/api/client.ts"] },
        { id: "shared", name: "Shared", description: "", paths: ["shared/index.ts"] },
      ],
      relationships: [],
    },
  };

  type Box = { x: number; y: number; width: number; height: number };

  // Positions of files in a layer are relative to the layer; this gives page positions.
  function absoluteBox(node: GraphFlowNode, all: Map<string, GraphFlowNode>): Box {
    const parent = node.parentId ? all.get(node.parentId)! : null;
    return {
      x: node.position.x + (parent?.position.x ?? 0),
      y: node.position.y + (parent?.position.y ?? 0),
      width: node.width ?? NODE_WIDTH,
      height: node.height ?? NODE_HEIGHT,
    };
  }

  it("sizes each layer box and keeps its files inside it, below the name", async () => {
    const placed = await layOut(withLayers);
    for (const layerId of ["layer:ui", "layer:shared"]) {
      const layer = placed.get(layerId)!;
      expect(layer.width).toBeGreaterThan(NODE_WIDTH);
      expect(layer.height).toBeGreaterThan(NODE_HEIGHT);
      for (const child of [...placed.values()].filter((n) => n.parentId === layerId)) {
        expect(child.position.x).toBeGreaterThanOrEqual(0);
        expect(child.position.y).toBeGreaterThanOrEqual(LAYER_LABEL_HEIGHT);  // clear of the name strip
        expect(child.position.x + NODE_WIDTH).toBeLessThanOrEqual(layer.width!);
        expect(child.position.y + NODE_HEIGHT).toBeLessThanOrEqual(layer.height!);
      }
    }
  });

  it("never overlaps two layer boxes, or a box and a file outside it", async () => {
    const placed = await layOut(withLayers);
    const topLevel = [...placed.values()].filter((n) => !n.parentId).map((n) => [n.id, absoluteBox(n, placed)] as const);
    for (let i = 0; i < topLevel.length; i++) {
      for (let j = i + 1; j < topLevel.length; j++) {
        const [aId, a] = topLevel[i]!;
        const [bId, b] = topLevel[j]!;
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart, `${aId} overlaps ${bId}`).toBe(true);
      }
    }
  });

  it("still places every importer to the left of what it imports, across layers", async () => {
    const placed = await layOut(withLayers);
    for (const edge of graph.edges) {
      const source = absoluteBox(placed.get(edge.source)!, placed);
      const target = absoluteBox(placed.get(edge.target)!, placed);
      expect(source.x, edge.id).toBeLessThan(target.x);
    }
  });

  it("gives the same layout for the same graph", async () => {
    const first = await layOut(withLayers);
    const second = await layOut(withLayers);
    for (const [id, node] of first) {
      expect(second.get(id)!.position).toEqual(node.position);
      expect(second.get(id)!.width).toEqual(node.width);
    }
  });
});
