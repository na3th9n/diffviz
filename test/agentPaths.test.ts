import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAgentOutput, normalizeAgentPath } from "../src/server/agentPaths.ts";

const root = path.join("/", "work", "app");
const normalize = (p: string) => normalizeAgentPath(p, root);

describe("normalizeAgentPath", () => {
  it("leaves an already-normalized path alone", () => {
    expect(normalize("src/App.tsx")).toBe("src/App.tsx");
  });

  it("removes a leading ./ or /, and surrounding spaces", () => {
    expect(normalize("./src/App.tsx")).toBe("src/App.tsx");
    expect(normalize("/src/App.tsx")).toBe("src/App.tsx");
    expect(normalize("  src/App.tsx ")).toBe("src/App.tsx");
  });

  it("turns backslashes into forward slashes", () => {
    expect(normalize("src\\utils\\date.ts")).toBe("src/utils/date.ts");
  });

  it("resolves . and .. segments and repeated slashes", () => {
    expect(normalize("src/ui/../App.tsx")).toBe("src/App.tsx");
    expect(normalize("src//./App.tsx")).toBe("src/App.tsx");
  });

  it("makes an absolute path inside the project relative", () => {
    expect(normalize(path.join(root, "src", "App.tsx"))).toBe("src/App.tsx");
  });

  it("keeps a path that leaves the project as it is, so the cross-check drops it", () => {
    expect(normalize("../other/x.ts")).toBe("../other/x.ts");
  });

  it("turns an empty path or the root itself into an empty string", () => {
    expect(normalize("")).toBe("");
    expect(normalize("./")).toBe("");
  });
});

describe("normalizeAgentOutput", () => {
  it("normalizes the paths in file notes, layers and relationships, and nothing else", () => {
    const output = normalizeAgentOutput(
      {
        schemaVersion: 1,
        summary: "./not/a/path",
        files: [{ path: "./a.ts", description: "./kept" }],
        layers: [{ id: "x", name: "X", description: "", paths: ["./a.ts", "b\\c.ts"] }],
        relationships: [{ source: "./a.ts", target: "/b.ts", label: "uses", description: "" }],
      },
      root,
    );
    expect(output).toEqual({
      schemaVersion: 1,
      summary: "./not/a/path",
      files: [{ path: "a.ts", description: "./kept" }],
      layers: [{ id: "x", name: "X", description: "", paths: ["a.ts", "b/c.ts"] }],
      relationships: [{ source: "a.ts", target: "b.ts", label: "uses", description: "" }],
    });
  });
});
