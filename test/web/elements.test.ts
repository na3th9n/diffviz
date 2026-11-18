import { describe, expect, it } from "vitest";
import { fitLabel, nodeLabels, toFlowElements, tooltipFor } from "../../src/web/graph/elements.ts";
import type { GraphState } from "../../src/shared/types.ts";

function graphOf(nodes: GraphState["nodes"], edges: GraphState["edges"] = []): GraphState {
  return { sessionPart: 1, baseCommit: "abc1234", isClean: false, errors: [], nodes, edges, agentOutput: null };
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
      body: "This file has been deleted.",
    });
  });

  it("says where a renamed file came from", () => {
    expect(tooltipFor({ id: "src/new.ts", status: "renamed", isTypeScript: true, oldPath: "src/old.ts" })).toEqual({
      title: "src/new.ts",
      body: "Renamed from src/old.ts.",
    });
  });

  it("has no tooltip for changed files (the agent adds those) or grayed-out imports", () => {
    expect(tooltipFor({ id: "a.ts", status: "changed", isTypeScript: true })).toBeNull();
    expect(tooltipFor({ id: "b.ts", status: "unchangedImport", isTypeScript: true })).toBeNull();
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
        data: { path: "src/App.tsx", label: "App.tsx", status: "changed", isTypeScript: true, tooltip: null },
      },
      {
        id: "src/theme.css",
        type: "file",
        position: { x: 0, y: 0 },
        width: 188,
        height: 40,
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
      { id: "a.ts->b.ts", type: "import", source: "a.ts", target: "b.ts", data: { toUnchanged: false } },
      { id: "a.ts->lib.ts", type: "import", source: "a.ts", target: "lib.ts", data: { toUnchanged: true } },
    ]);
  });
});
