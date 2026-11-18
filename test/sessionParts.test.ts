import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, GraphState } from "../src/shared/types.ts";
import { ProjectState } from "../src/server/projectState.ts";
import { readLog } from "../src/server/sessionLog.ts";
import { partDir } from "../src/server/versions.ts";
import { agentFixture } from "./helpers/agentFixtures.ts";
import { createRepoFromFixture, type TestRepo } from "./helpers/gitRepo.ts";

// A session part from start to commit, the way the hooks and the agent drive it.

function expectGraph(state: AppState): GraphState {
  if (state.repo !== "ready" || state.graph === null) throw new Error(`Expected a graph, got repo "${state.repo}"`);
  return state.graph;
}

function makeChange(repo: TestRepo): void {
  repo.write("src/App.tsx", 'import { Button } from "@/components";\nimport styles from "./App.module.css";\nexport const App = () => [Button, styles];\n');
  repo.write("src/utils/date.ts", 'import { formatLabel } from "./format";\nexport const today = () => formatLabel("now");\n');
}

const currentJson = (repo: TestRepo) => path.join(repo.root, ".diffviz", "current.json");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("a session part", () => {
  it("logs prompts and responses, and which prompt each version followed", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();

    await projectState.promptSubmitted("Add a date helper", "s1");
    makeChange(repo);
    repo.write(".diffviz/current.json", agentFixture("valid.json"));
    const state = await projectState.agentFinished("Added it.", "s1");

    expect(state.activity).toEqual({ promptCount: 1, aiOutputAfterPrompt: 1 });
    expect(expectGraph(state).errors).toEqual([]);
    const log = await readLog(repo.root, expectGraph(state).baseCommit);
    expect(log.map((entry) => entry.type)).toEqual(["prompt", "aiOutput", "response"]);
    expect(log[2]).toMatchObject({ type: "response", afterPrompt: 1, text: "Added it." });
  });

  it("logs a prompt before any output the agent writes in reply, however quickly", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();

    const prompt = projectState.promptSubmitted("Add a date helper", null);
    makeChange(repo);
    repo.write(".diffviz/current.json", agentFixture("valid.json"));
    await Promise.all([prompt, projectState.refresh()]);

    const log = await readLog(repo.root, expectGraph((await projectState.refresh())).baseCommit);
    expect(log).toMatchObject([
      { type: "prompt", prompt: 1 },
      { type: "aiOutput", afterPrompt: 1 },
    ]);
  });

  it("logs a prompt sent right after a commit to the new session part", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    makeChange(repo);
    await projectState.refresh();
    const head = repo.commitAll();  // no refresh in between

    await projectState.promptSubmitted("Next step", null);
    expect(await readLog(repo.root, head)).toMatchObject([{ type: "prompt", prompt: 1, text: "Next step" }]);
  });

  it("on a commit: saves the final graph, removes the old current.json, and starts empty", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    await projectState.promptSubmitted("Add a date helper", null);
    makeChange(repo);
    repo.write(".diffviz/current.json", agentFixture("valid.json"));
    const before = expectGraph(await projectState.agentFinished());

    repo.git("add", "--", "src");  // commit the code, as the user would (.diffviz is the App's, not theirs)
    repo.git("commit", "--quiet", "-m", "Add a date helper");
    const after = await projectState.refresh();
    const graph = expectGraph(after);

    expect(graph.baseCommit).not.toBe(before.baseCommit);
    expect(graph).toMatchObject({ isClean: true, nodes: [], agentOutput: null, errors: [] });
    expect(after.activity).toEqual({ promptCount: 0, aiOutputAfterPrompt: null });

    const final = JSON.parse(readFileSync(path.join(partDir(repo.root, before.baseCommit), "final.json"), "utf8"));
    expect(final.endCommit).toBe(graph.baseCommit);
    expect(final.graph.nodes.map((n: { id: string }) => n.id)).toContain("src/utils/date.ts");
    expect(final.graph.agentOutput.summary).toContain("date helper");

    // Its content is safe in the old part's versions, so the agent starts the new part fresh.
    expect(existsSync(currentJson(repo))).toBe(false);
  });

  it("keeps a current.json the agent already wrote for the new part", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    await projectState.refresh();
    makeChange(repo);
    repo.write(".diffviz/current.json", agentFixture("valid.json"));
    await projectState.refresh();

    repo.git("add", "--", "src");
    repo.git("commit", "--quiet", "-m", "commit");
    repo.write("src/main.ts", "console.log(1);\n");
    repo.write(".diffviz/current.json", agentFixture("messy-paths.json"));  // written before the App noticed the commit
    const graph = expectGraph(await projectState.refresh());

    expect(readFileSync(currentJson(repo), "utf8")).toBe(agentFixture("messy-paths.json"));
    expect(graph.agentOutput).not.toBeNull();
  });

  it("removes a current.json left from an earlier part when the App starts again", async () => {
    const repo = createRepoFromFixture("basic-app");
    const first = new ProjectState(repo.root);
    await first.refresh();
    makeChange(repo);
    repo.write(".diffviz/current.json", agentFixture("valid.json"));
    await first.refresh();
    repo.git("add", "--", "src");
    repo.git("commit", "--quiet", "-m", "commit");  // committed while the App was closed

    const restarted = new ProjectState(repo.root);
    const graph = expectGraph(await restarted.refresh());
    expect(graph.agentOutput).toBeNull();
    expect(existsSync(currentJson(repo))).toBe(false);
  });

  it("keeps current.json when the App restarts in the same part", async () => {
    const repo = createRepoFromFixture("basic-app");
    const first = new ProjectState(repo.root);
    await first.refresh();
    makeChange(repo);
    repo.write(".diffviz/current.json", agentFixture("valid.json"));
    await first.refresh();

    const restarted = new ProjectState(repo.root);
    expect(expectGraph(await restarted.refresh()).agentOutput).not.toBeNull();
  });
});
