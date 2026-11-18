import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "../src/shared/types.ts";
import { parseAgentOutput } from "../src/server/agentOutput.ts";
import { normalizeAgentOutput } from "../src/server/agentPaths.ts";
import { crossCheck } from "../src/server/crossCheck.ts";
import { agentFixture } from "./helpers/agentFixtures.ts";

// The graph for the change the fixtures describe: App.tsx edited, utils/date.ts added.
const nodes: GraphNode[] = [
  { id: "src/App.module.css", status: "unchangedImport", isTypeScript: false },
  { id: "src/App.tsx", status: "changed", isTypeScript: true },
  { id: "src/components/index.ts", status: "unchangedImport", isTypeScript: true },
  { id: "src/utils/date.ts", status: "changed", isTypeScript: true },
  { id: "src/utils/format.ts", status: "unchangedImport", isTypeScript: true },
];
const edge = (source: string, target: string): GraphEdge => ({ id: `${source}->${target}`, source, target });
const edges: GraphEdge[] = [
  edge("src/App.tsx", "src/App.module.css"),
  edge("src/App.tsx", "src/components/index.ts"),
  edge("src/utils/date.ts", "src/utils/format.ts"),
];

function loadFixture(name: string) {
  const result = parseAgentOutput(agentFixture(name));
  if (!result.ok) throw new Error(`Fixture ${name} should be valid: ${result.message}`);
  return normalizeAgentOutput(result.output, path.join("/", "work", "app"));
}

describe("crossCheck", () => {
  it("keeps everything when the output matches the graph", () => {
    const output = loadFixture("valid.json");
    const result = crossCheck(output, nodes, edges);
    expect(result.output).toEqual(output);
    expect(result.warnings).toEqual([]);
  });

  it("drops what doesn't match the graph and keeps the rest", () => {
    const { output, warnings } = crossCheck(loadFixture("messy-paths.json"), nodes, edges);

    expect(output.summary).toBe("Added a date helper.");
    expect(output.files.map((f) => [f.path, f.description])).toEqual([
      ["src/App.tsx", "Leading ./ is removed."],  // the first of the two notes
      ["src/utils/date.ts", "Backslashes become forward slashes."],
    ]);
    expect(output.layers.map((l) => [l.id, l.name, l.paths])).toEqual([
      ["ui", "UI", ["src/App.tsx"]],               // listed twice in one layer: kept once
      ["utils", "Utilities", ["src/utils/date.ts"]],  // App.tsx stays in "ui", the first layer
    ]);
    expect(output.relationships.map((r) => r.label)).toEqual(["styled by"]);

    expect(warnings).toEqual([
      'file note "src/App.tsx" appears more than once; kept the first',
      'file note "src/utils/format.ts" is for an unchanged file',
      'file note "src/Missing.tsx" does not match a file in the graph',
      '"src/App.tsx" is in layers "ui" and "utils"; kept it in "ui"',
      'layer "ghost" lists "src/Nope.ts", which is not in the graph',
      'layer "ghost" has no files in the graph; dropped it',
      'layer id "ui" is used more than once; kept the first',
      'relationship "src/utils/date.ts->src/App.tsx" does not match an import arrow',
    ]);
  });

  it("lets a layer include a grayed-out import", () => {
    const output = { ...loadFixture("valid.json"), layers: [{ id: "u", name: "U", description: "", paths: ["src/utils/format.ts"] }] };
    expect(crossCheck(output, nodes, edges).output.layers).toHaveLength(1);
  });

  it("keeps only the first label for the same arrow", () => {
    const relationship = { source: "src/App.tsx", target: "src/components/index.ts", label: "renders", description: "" };
    const output = { ...loadFixture("valid.json"), relationships: [relationship, { ...relationship, label: "uses" }] };
    const result = crossCheck(output, nodes, edges);
    expect(result.output.relationships.map((r) => r.label)).toEqual(["renders"]);
    expect(result.warnings).toEqual(['relationship "src/App.tsx->src/components/index.ts" appears more than once; kept the first']);
  });

  it("drops every label when the graph is empty, but keeps the summary", () => {
    const result = crossCheck(loadFixture("valid.json"), [], []);
    expect(result.output).toMatchObject({ summary: expect.stringContaining("date helper"), files: [], layers: [], relationships: [] });
  });
});
