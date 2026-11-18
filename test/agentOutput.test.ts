import { describe, expect, it } from "vitest";
import { formatIssues, parseAgentOutput } from "../src/server/agentOutput.ts";
import { agentFixture } from "./helpers/agentFixtures.ts";

function expectRejected(text: string): string {
  const result = parseAgentOutput(text);
  if (result.ok) throw new Error("Expected current.json to be rejected");
  return result.message;
}

describe("parseAgentOutput", () => {
  it("accepts a valid current.json", () => {
    const result = parseAgentOutput(agentFixture("valid.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.schemaVersion).toBe(1);
    expect(result.output.files.map((f) => f.path)).toEqual(["src/App.tsx", "src/utils/date.ts"]);
    expect(result.output.layers.map((l) => l.id)).toEqual(["ui", "utils"]);
    expect(result.output.relationships).toHaveLength(2);
  });

  it("drops unknown extra fields instead of rejecting the file", () => {
    const result = parseAgentOutput(agentFixture("messy-paths.json"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).not.toHaveProperty("model");
  });

  it("rejects a file that is not JSON, with the parser's reason", () => {
    expect(expectRejected(agentFixture("invalid-json.json"))).toMatch(/^not valid JSON \(.+\)$/);
  });

  it("rejects the wrong shape and names where each problem is", () => {
    const message = expectRejected(agentFixture("wrong-types.json"));
    expect(message).toContain("summary: ");
    expect(message).toContain("files[0].path: ");
  });

  it("rejects a schemaVersion it does not read", () => {
    expect(expectRejected(agentFixture("wrong-version.json"))).toBe("schemaVersion: schemaVersion must be 1");
  });

  it("rejects JSON that is not an object", () => {
    expect(expectRejected("[]")).toMatch(/^\(whole file\): /);
  });
});

describe("formatIssues", () => {
  it("lists the first three problems and counts the rest", () => {
    const issues = [
      { path: ["files", 0, "path"], message: "a" },
      { path: ["layers", 1, "paths", 2], message: "b" },
      { path: ["summary"], message: "c" },
      { path: ["relationships"], message: "d" },
      { path: ["schemaVersion"], message: "e" },
    ];
    expect(formatIssues(issues)).toBe("files[0].path: a; layers[1].paths[2]: b; summary: c; and 2 more");
  });
});
