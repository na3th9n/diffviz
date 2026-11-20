import { describe, expect, it } from "vitest";
import { fitLabel, nodeLabels, paragraphs, toFlowElements, tooltipFor } from "../../src/web/graph/elements.ts";
import type { AgentOutput, GraphState } from "../../src/shared/types.ts";

function graphOf(nodes: GraphState["nodes"], edges: GraphState["edges"] = [], agentOutput: AgentOutput | null = null): GraphState {
  return { sessionPart: 1, baseCommit: "abc1234", isClean: false, errors: [], nodes, edges, agentOutput };
}

function outputOf(parts: Partial<AgentOutput>): AgentOutput {
  return { schemaVersion: 1, summary: "", files: [], layers: [], relationships: [], ...parts };
}

describe("nodeLabels", () => {
  it("uses just the file name when it is unique", () => {
    const labels = nodeLabels(["apps/web/src/pages/DashboardPage.tsx", "apps/server/src/index.ts"]);
    expect(labels.get("apps/web/src/pages/DashboardPage.tsx")).toBe("DashboardPage.tsx");
    expect(labels.get("apps/server/src/index.ts")).toBe("index.ts");
  });

  it("adds folders only to the names that clash", () => {
    const labels = nodeLabels(["src/components/index.ts", "src/utils/index.ts", "src/App.tsx"]);
    expect(labels.get("src/components/index.ts")).toBe("components/index.ts");
    expect(labels.get("src/utils/index.ts")).toBe("utils/index.ts");
    expect(labels.get("src/App.tsx")).toBe("App.tsx");
  });

  it("keeps adding folders until the endings differ", () => {
    const labels = nodeLabels(["apps/web/src/index.ts", "apps/server/src/index.ts"]);
    expect(labels.get("apps/web/src/index.ts")).toBe("web/src/index.ts");
    expect(labels.get("apps/server/src/index.ts")).toBe("server/src/index.ts");
  });

  it("stops at the full path when one path is the ending of another", () => {
    const labels = nodeLabels(["index.ts", "src/index.ts"]);
    expect(labels.get("index.ts")).toBe("index.ts");
    expect(labels.get("src/index.ts")).toBe("src/index.ts");
  });
});

describe("fitLabel", () => {
  it("leaves a label that fits unchanged", () => {
    expect(fitLabel("DashboardPage.tsx", false)).toBe("DashboardPage.tsx");
  });

  it("cuts a long label from the left so the file name stays", () => {
    const label = fitLabel("server/src/services/mockEmailProvider.ts", false);
    expect(label).toBe("…s/mockEmailProvider.ts");
    expect(label).toHaveLength(23);
  });

  it("leaves less room when the node has a renamed tag", () => {
    const label = fitLabel("ApplicationRowEditor.tsx", true);
    expect(label).toBe("…onRowEditor.tsx");
    expect(label).toHaveLength(16);
  });
});

describe("tooltipFor", () => {
  it("says a deleted file was deleted", () => {
    expect(tooltipFor({ id: "src/old.ts", status: "deleted", isTypeScript: true })).toEqual({
      title: "src/old.ts",
      titleIsPath: true,
      body: ["This file has been deleted."],
    });
  });

  it("says where a renamed file came from", () => {
    expect(tooltipFor({ id: "src/new.ts", status: "renamed", isTypeScript: true, oldPath: "src/old.ts" })?.body).toEqual([
      "Renamed from src/old.ts.",
    ]);
  });

  it("shows the agent's description for a changed file, and nothing without one", () => {
    const node = { id: "a.ts", status: "changed", isTypeScript: true } as const;
    expect(tooltipFor(node)).toBeNull();
    expect(tooltipFor(node, { path: "a.ts", description: "Adds a helper.\n\nUsed by the header." })).toEqual({
      title: "a.ts",
      titleIsPath: true,
      body: ["Adds a helper.", "Used by the header."],
    });
  });

  it("puts git's sentence before the agent's description for deleted and renamed files", () => {
    const note = { path: "src/old.ts", description: "Replaced by the new client." };
    expect(tooltipFor({ id: "src/old.ts", status: "deleted", isTypeScript: true }, note)?.body).toEqual([
      "This file has been deleted.",
      "Replaced by the new client.",
    ]);
  });

  it("never gives a grayed-out import a tooltip", () => {
    expect(tooltipFor({ id: "b.ts", status: "unchangedImport", isTypeScript: true }, { path: "b.ts", description: "x" })).toBeNull();
  });
});

describe("paragraphs", () => {
  it("splits at blank lines, keeps single line breaks, and drops empty parts", () => {
    expect(paragraphs("One.\nStill one.\n\n  Two.  \n \n\n")).toEqual(["One.\nStill one.", "Two."]);
    expect(paragraphs("   ")).toEqual([]);
  });
});

describe("toFlowElements", () => {
  it("makes a sized file node per GraphNode, carrying status, type, label and tooltip", () => {
    const { nodes } = toFlowElements(
      graphOf([
        { id: "src/App.tsx", status: "changed", isTypeScript: true },
        { id: "src/theme.css", status: "unchangedImport", isTypeScript: false },
      ]),
    );
    expect(nodes).toEqual([
      {
        id: "src/App.tsx",
        type: "file",
        position: { x: 0, y: 0 },
        width: 188,
        height: 40,
        zIndex: 2,
        data: { path: "src/App.tsx", label: "App.tsx", status: "changed", isTypeScript: true, tooltip: null },
      },
      {
        id: "src/theme.css",
        type: "file",
        position: { x: 0, y: 0 },
        width: 188,
        height: 40,
        zIndex: 2,
        data: { path: "src/theme.css", label: "theme.css", status: "unchangedImport", isTypeScript: false, tooltip: null },
      },
    ]);
  });

  it("marks arrows that point at a grayed-out file as dim", () => {
    const { edges } = toFlowElements(
      graphOf(
        [
          { id: "a.ts", status: "changed", isTypeScript: true },
          { id: "b.ts", status: "changed", isTypeScript: true },
          { id: "lib.ts", status: "unchangedImport", isTypeScript: true },
        ],
        [
          { id: "a.ts->b.ts", source: "a.ts", target: "b.ts" },
          { id: "a.ts->lib.ts", source: "a.ts", target: "lib.ts" },
        ],
      ),
    );
    expect(edges).toEqual([
      { id: "a.ts->b.ts", type: "import", source: "a.ts", target: "b.ts", zIndex: 1, data: { toUnchanged: false, tooltip: null } },
      { id: "a.ts->lib.ts", type: "import", source: "a.ts", target: "lib.ts", zIndex: 1, data: { toUnchanged: true, tooltip: null } },
    ]);
  });

  describe("with the agent's output", () => {
    const nodes: GraphState["nodes"] = [
      { id: "src/App.tsx", status: "changed", isTypeScript: true },
      { id: "src/api.ts", status: "changed", isTypeScript: true },
      { id: "src/util.ts", status: "unchangedImport", isTypeScript: true },
    ];
    const edges: GraphState["edges"] = [
      { id: "src/App.tsx->src/api.ts", source: "src/App.tsx", target: "src/api.ts" },
      { id: "src/api.ts->src/util.ts", source: "src/api.ts", target: "src/util.ts" },
    ];
    const output = outputOf({
      files: [{ path: "src/App.tsx", description: "Shows the sync banner." }],
      layers: [{ id: "ui", name: "UI", description: "React components.", paths: ["src/App.tsx"] }],
      relationships: [{ source: "src/App.tsx", target: "src/api.ts", label: "fetches from", description: "Loads the status." }],
    });

    it("stacks layer boxes behind arrows, and arrows behind files", () => {
      const { nodes: flowNodes, edges: flowEdges } = toFlowElements(graphOf(nodes, edges, output));
      const z = (id: string) => flowNodes.find((n) => n.id === id)?.zIndex;
      expect(z("layer:ui")).toBeLessThan(flowEdges[0]!.zIndex!);
      expect(flowEdges[0]!.zIndex).toBeLessThan(z("src/App.tsx")!);  // inside a layer
      expect(flowEdges[0]!.zIndex).toBeLessThan(z("src/util.ts")!);  // outside any layer
    });

    it("adds a box per layer, before the files, and puts its files inside it", () => {
      const { nodes: flowNodes } = toFlowElements(graphOf(nodes, edges, output));
      expect(flowNodes.map((n) => [n.id, n.type, n.parentId])).toEqual([
        ["layer:ui", "layer", undefined],
        ["src/App.tsx", "file", "layer:ui"],
        ["src/api.ts", "file", undefined],   // not in a layer: stays outside
        ["src/util.ts", "file", undefined],
      ]);
      expect(flowNodes[0]?.data).toEqual({
        name: "UI",
        tooltip: { title: "UI", titleIsPath: false, body: ["React components."] },
      });
    });

    it("gives a file the agent's description as its tooltip", () => {
      const { nodes: flowNodes } = toFlowElements(graphOf(nodes, edges, output));
      const app = flowNodes.find((n) => n.id === "src/App.tsx");
      expect(app?.data.tooltip?.body).toEqual(["Shows the sync banner."]);
    });

    it("labels only the arrows the agent described", () => {
      const { edges: flowEdges } = toFlowElements(graphOf(nodes, edges, output));
      expect(flowEdges.map((e) => e.data?.tooltip)).toEqual([
        { title: "fetches from", titleIsPath: false, body: ["Loads the status."] },
        null,
      ]);
    });
  });
});
