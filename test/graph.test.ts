import { describe, expect, it } from "vitest";
import { buildGraphState, filesToParse, isTypeScriptPath } from "../src/server/graph.ts";
import type { FileChange } from "../src/shared/types.ts";

const base = { sessionPart: 1, baseCommit: "abc1234", isClean: false, errors: [] };

describe("isTypeScriptPath", () => {
  it.each(["a.ts", "a.tsx", "a.mts", "a.cts", "types.d.ts"])("treats %s as TypeScript", (file) => {
    expect(isTypeScriptPath(file)).toBe(true);
  });
  it.each(["a.js", "a.jsx", "a.css", "a.json", ".env", "ts"])("treats %s as not TypeScript", (file) => {
    expect(isTypeScriptPath(file)).toBe(false);
  });
});

describe("filesToParse", () => {
  it("keeps changed and renamed TypeScript files, never deleted or non-TypeScript ones", () => {
    const changes: FileChange[] = [
      { path: "a.ts", change: "modified" },
      { path: "b.ts", change: "added" },
      { path: "c.ts", change: "renamed", oldPath: "old-c.ts" },
      { path: "d.ts", change: "deleted" },
      { path: "e.css", change: "modified" },
      { path: "f.js", change: "added" },
    ];
    expect(filesToParse(changes)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
});

describe("buildGraphState", () => {
  it("turns each kind of change into the matching node", () => {
    const graph = buildGraphState({
      ...base,
      changes: [
        { path: "src/a.ts", change: "modified" },
        { path: "src/b.ts", change: "added" },
        { path: "src/gone.ts", change: "deleted" },
        { path: "src/new.ts", change: "renamed", oldPath: "src/old.ts" },
        { path: "src/style.css", change: "modified" },
      ],
      imports: new Map(),
    });
    expect(graph.nodes).toEqual([
      { id: "src/a.ts", status: "changed", isTypeScript: true },
      { id: "src/b.ts", status: "changed", isTypeScript: true },
      { id: "src/gone.ts", status: "deleted", isTypeScript: true },
      { id: "src/new.ts", status: "renamed", isTypeScript: true, oldPath: "src/old.ts" },
      { id: "src/style.css", status: "changed", isTypeScript: false },
    ]);
    expect(graph.edges).toEqual([]);
  });

  it("adds a grayed-out node for an unchanged import, and an arrow from importer to imported", () => {
    const graph = buildGraphState({
      ...base,
      changes: [{ path: "a.ts", change: "modified" }],
      imports: new Map([["a.ts", ["lib.ts", "theme.css"]]]),
    });
    expect(graph.nodes).toEqual([
      { id: "a.ts", status: "changed", isTypeScript: true },
      { id: "lib.ts", status: "unchangedImport", isTypeScript: true },
      { id: "theme.css", status: "unchangedImport", isTypeScript: false },
    ]);
    expect(graph.edges).toEqual([
      { id: "a.ts->lib.ts", source: "a.ts", target: "lib.ts" },
      { id: "a.ts->theme.css", source: "a.ts", target: "theme.css" },
    ]);
  });

  it("points at the changed node when a changed file imports another changed file", () => {
    const graph = buildGraphState({
      ...base,
      // b.ts comes after a.ts, so this also checks that order does not matter.
      changes: [
        { path: "a.ts", change: "modified" },
        { path: "b.ts", change: "added" },
      ],
      imports: new Map([["a.ts", ["b.ts"]], ["b.ts", []]]),
    });
    expect(graph.nodes.map((n) => [n.id, n.status])).toEqual([
      ["a.ts", "changed"],
      ["b.ts", "changed"],
    ]);
    expect(graph.edges.map((e) => e.id)).toEqual(["a.ts->b.ts"]);
  });

  it("gives renamed files outgoing arrows and deleted files none", () => {
    const graph = buildGraphState({
      ...base,
      changes: [
        { path: "new.ts", change: "renamed", oldPath: "old.ts" },
        { path: "gone.ts", change: "deleted" },
      ],
      // gone.ts should never be in the map, but even if it were, it gets no arrows.
      imports: new Map([["new.ts", ["lib.ts"]], ["gone.ts", ["lib2.ts"]]]),
    });
    expect(graph.edges.map((e) => e.id)).toEqual(["new.ts->lib.ts"]);
    expect(graph.nodes.map((n) => n.id)).toEqual(["gone.ts", "lib.ts", "new.ts"]);
  });

  it("ignores imports of files that are not part of the changes (one hop only)", () => {
    const graph = buildGraphState({
      ...base,
      changes: [{ path: "a.ts", change: "modified" }],
      imports: new Map([["a.ts", ["lib.ts"]], ["lib.ts", ["deeper.ts"]]]),
    });
    expect(graph.nodes.map((n) => n.id)).toEqual(["a.ts", "lib.ts"]);
    expect(graph.edges.map((e) => e.id)).toEqual(["a.ts->lib.ts"]);
  });

  it("returns the same output for the same input, regardless of order", () => {
    const changes: FileChange[] = [
      { path: "b.ts", change: "modified" },
      { path: "a.ts", change: "modified" },
    ];
    const imports = new Map([["b.ts", ["z.ts", "y.ts"]], ["a.ts", ["y.ts"]]]);
    const first = buildGraphState({ ...base, changes, imports });
    const second = buildGraphState({ ...base, changes: [...changes].reverse(), imports: new Map([...imports].reverse()) });
    expect(second).toEqual(first);
    expect(first.nodes.map((n) => n.id)).toEqual(["a.ts", "b.ts", "y.ts", "z.ts"]);
  });

  it("carries the git fields through and leaves agentOutput empty", () => {
    const graph = buildGraphState({
      sessionPart: 3,
      baseCommit: "def5678",
      isClean: true,
      errors: [{ code: "dirtyAtLaunch", message: "m" }],
      changes: [],
      imports: new Map(),
    });
    expect(graph).toEqual({
      sessionPart: 3,
      baseCommit: "def5678",
      isClean: true,
      errors: [{ code: "dirtyAtLaunch", message: "m" }],
      nodes: [],
      edges: [],
      agentOutput: null,
    });
  });
});
