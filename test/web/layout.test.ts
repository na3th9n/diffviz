import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH, toFlowElements, type FileFlowNode } from "../../src/web/graph/elements.ts";
import { layoutGraph } from "../../src/web/graph/layout.ts";
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

async function layOut(): Promise<Map<string, FileFlowNode>> {
  const { nodes, edges } = toFlowElements(graph);
  const placed = await layoutGraph(nodes, edges);
  return new Map(placed.map((node) => [node.id, node]));
}

function overlaps(a: FileFlowNode, b: FileFlowNode): boolean {
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
