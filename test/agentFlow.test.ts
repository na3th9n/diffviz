import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, GraphState } from "../src/shared/types.ts";
import { ProjectState } from "../src/server/projectState.ts";
import { partDir } from "../src/server/versions.ts";
import { agentFixture } from "./helpers/agentFixtures.ts";
import { createRepoFromFixture, type TestRepo } from "./helpers/gitRepo.ts";

// End to end: a real repo of fixtures/basic-app, with current.json written
// into .diffviz/ the way the agent would.

function expectGraph(state: AppState): GraphState {
  if (state.repo !== "ready" || state.graph === null) throw new Error(`Expected a graph, got repo "${state.repo}"`);
  return state.graph;
}

const errorCodes = (graph: GraphState) => graph.errors.map((e) => e.code);

// The change every fixture in fixtures/agent-output/ describes.
function makeChange(repo: TestRepo): void {
  repo.write("src/App.tsx", 'import { Button } from "@/components";\nimport styles from "./App.module.css";\nexport const App = () => [Button, styles];\n');
  repo.write("src/utils/date.ts", 'import { formatLabel } from "./format";\nexport const today = () => formatLabel("now");\n');
}

function writeOutput(repo: TestRepo, text: string): void {
  repo.write(".diffviz/current.json", text);
}

function savedVersions(repo: TestRepo, baseCommit: string): string[] {
  const dir = path.join(partDir(repo.root, baseCommit), "versions");
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("labelling the graph from current.json", () => {
  it("shows no labels and no AI errors before the agent writes anything", async () => {
    const repo = createRepoFromFixture("basic-app");
    makeChange(repo);
    const graph = expectGraph(await new ProjectState(repo.root).refresh());
    expect(graph.agentOutput).toBeNull();
    expect(errorCodes(graph)).toEqual(["dirtyAtLaunch"]);
  });

  it("attaches a valid current.json and saves it as the first version", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();  // launch on a clean tree
    makeChange(repo);
    writeOutput(repo, agentFixture("valid.json"));

    const graph = expectGraph(await projectState.refresh());
    expect(graph.errors).toEqual([]);
    expect(graph.agentOutput?.files.map((f) => f.path)).toEqual(["src/App.tsx", "src/utils/date.ts"]);
    expect(graph.agentOutput?.relationships.map((r) => r.label)).toEqual(["renders", "formats with"]);
    expect(savedVersions(repo, graph.baseCommit)).toEqual(["0001.json"]);
  });

  it("sends only what matches the graph, and logs what it dropped once", async () => {
    const repo = createRepoFromFixture("basic-app");
    makeChange(repo);
    writeOutput(repo, agentFixture("messy-paths.json"));
    const projectState = new ProjectState(repo.root);

    const graph = expectGraph(await projectState.refresh());
    expect(graph.agentOutput?.files.map((f) => f.path)).toEqual(["src/App.tsx", "src/utils/date.ts"]);
    expect(graph.agentOutput?.relationships.map((r) => `${r.source}->${r.target}`)).toEqual(["src/App.tsx->src/App.module.css"]);
    expect(warn).toHaveBeenCalledTimes(8);

    await projectState.refresh();  // same output, same graph: nothing new to log
    expect(warn).toHaveBeenCalledTimes(8);
  });

  it("shows a note as soon as the file it describes is created", async () => {
    const repo = createRepoFromFixture("basic-app");
    repo.write("src/App.tsx", 'import { Button } from "@/components";\nexport const App = Button;\n');
    writeOutput(repo, agentFixture("valid.json"));  // already describes src/utils/date.ts
    const projectState = new ProjectState(repo.root);
    expect(expectGraph(await projectState.refresh()).agentOutput?.files.map((f) => f.path)).toEqual(["src/App.tsx"]);

    makeChange(repo);
    expect(expectGraph(await projectState.refresh()).agentOutput?.files.map((f) => f.path)).toEqual([
      "src/App.tsx",
      "src/utils/date.ts",
    ]);
  });
});

describe("aiOutputInvalid", () => {
  it("keeps the last valid labels and shows why the new file was rejected", async () => {
    const repo = createRepoFromFixture("basic-app");
    makeChange(repo);
    writeOutput(repo, agentFixture("valid.json"));
    const projectState = new ProjectState(repo.root);
    const valid = expectGraph(await projectState.refresh());

    writeOutput(repo, agentFixture("wrong-types.json"));
    const graph = expectGraph(await projectState.refresh());
    expect(errorCodes(graph)).toEqual(["dirtyAtLaunch", "aiOutputInvalid"]);
    expect(graph.errors[1]?.message).toContain("files[0].path");
    expect(graph.agentOutput).toEqual(valid.agentOutput);
    expect(graph.nodes).toEqual(valid.nodes);
    expect(savedVersions(repo, graph.baseCommit)).toEqual(["0001.json"]);  // invalid versions are not saved
  });

  it("clears once a valid file is written again", async () => {
    const repo = createRepoFromFixture("basic-app");
    makeChange(repo);
    writeOutput(repo, agentFixture("invalid-json.json"));
    const projectState = new ProjectState(repo.root);
    const broken = expectGraph(await projectState.refresh());
    expect(errorCodes(broken)).toContain("aiOutputInvalid");
    expect(broken.agentOutput).toBeNull();
    expect(broken.nodes.length).toBeGreaterThan(0);  // the graph is still drawn

    writeOutput(repo, agentFixture("valid.json"));
    const fixed = expectGraph(await projectState.refresh());
    expect(errorCodes(fixed)).toEqual(["dirtyAtLaunch"]);
    expect(fixed.agentOutput).not.toBeNull();
  });

  it("reports a current.json it cannot read without failing the refresh", async () => {
    const repo = createRepoFromFixture("basic-app");
    makeChange(repo);
    mkdirSync(path.join(repo.root, ".diffviz", "current.json"), { recursive: true });  // a folder, not a file
    const graph = expectGraph(await new ProjectState(repo.root).refresh());
    expect(graph.errors.find((e) => e.code === "aiOutputInvalid")?.message).toMatch(/^current.json could not be read: /);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it("keeps the labels, with no error, when current.json is deleted", async () => {
    const repo = createRepoFromFixture("basic-app");
    makeChange(repo);
    writeOutput(repo, agentFixture("valid.json"));
    const projectState = new ProjectState(repo.root);
    const before = expectGraph(await projectState.refresh());

    repo.remove(".diffviz/current.json");
    const after = expectGraph(await projectState.refresh());
    expect(after.agentOutput).toEqual(before.agentOutput);
    expect(errorCodes(after)).toEqual(["dirtyAtLaunch"]);
  });
});

describe("aiOutputMissing", () => {
  it("is shown when the agent finishes after changing code without rewriting current.json", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    makeChange(repo);

    const graph = expectGraph(await projectState.agentFinished());
    expect(errorCodes(graph)).toEqual(["aiOutputMissing"]);
  });

  it("is not shown when current.json was written just before the agent finished", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    makeChange(repo);
    writeOutput(repo, agentFixture("valid.json"));  // no refresh in between, as when the hook beats the watcher

    expect(errorCodes(expectGraph(await projectState.agentFinished()))).toEqual([]);
  });

  it("is not shown when the code did not change during the turn", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    makeChange(repo);
    writeOutput(repo, agentFixture("valid.json"));
    await projectState.agentFinished();

    // A second turn that only answers a question: no code change, no rewrite.
    expect(errorCodes(expectGraph(await projectState.agentFinished()))).toEqual([]);
  });

  it("clears when current.json is written", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    makeChange(repo);
    await projectState.agentFinished();

    writeOutput(repo, agentFixture("valid.json"));
    expect(errorCodes(expectGraph(await projectState.refresh()))).toEqual([]);
  });
});

describe("a new commit", () => {
  it("starts the next session part with no labels, and saves its versions in a new folder", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    makeChange(repo);
    writeOutput(repo, agentFixture("wrong-types.json"));
    await projectState.agentFinished();
    writeOutput(repo, agentFixture("valid.json"));
    const firstBase = expectGraph(await projectState.refresh()).baseCommit;

    const head = repo.commitAll();  // .diffviz is committed too here, but git never reports it as a change
    repo.write("src/main.ts", "console.log(1);\n");
    const next = expectGraph(await projectState.refresh());
    expect(next.baseCommit).toBe(head);
    expect(next.agentOutput).toBeNull();  // the old part's current.json is not applied to the new part
    expect(next.errors).toEqual([]);

    writeOutput(repo, agentFixture("messy-paths.json"));
    expect(expectGraph(await projectState.refresh()).agentOutput).not.toBeNull();
    expect(savedVersions(repo, firstBase)).toEqual(["0001.json"]);
    expect(savedVersions(repo, head)).toEqual(["0001.json"]);
  });
});
