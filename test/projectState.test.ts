import { describe, expect, it } from "vitest";
import type { AppState, GraphState } from "../src/shared/types.ts";
import { ProjectState } from "../src/server/projectState.ts";
import { createRepo, createRepoFromFixture, makeTempDir } from "./helpers/gitRepo.ts";

function expectGraph(state: AppState): GraphState {
  if (state.repo !== "ready" || state.graph === null) throw new Error(`Expected a graph, got repo "${state.repo}"`);
  return state.graph;
}

// "id status" pairs, easier to read in a failing test than full node objects.
function nodeSummary(graph: GraphState): string[] {
  return graph.nodes.map((n) => `${n.id} ${n.status}${n.isTypeScript ? "" : " (non-TS)"}`);
}

describe("ProjectState on the basic-app fixture", () => {
  it("shows no nodes for a clean tree", async () => {
    const repo = createRepoFromFixture("basic-app");
    const graph = expectGraph(await new ProjectState(repo.root).refresh());
    expect(graph.isClean).toBe(true);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("graphs an edited file with one hop of grayed-out imports", async () => {
    const repo = createRepoFromFixture("basic-app");
    repo.write("src/App.tsx", 'import { Button } from "@/components";\nimport "./styles.css";\nexport const App = () => Button;\n');

    const graph = expectGraph(await new ProjectState(repo.root).refresh());

    expect(nodeSummary(graph)).toEqual([
      "src/App.tsx changed",
      "src/components/index.ts unchangedImport",  // not followed further to Button.tsx: one hop only
      "src/styles.css unchangedImport (non-TS)",
    ]);
    expect(graph.edges.map((e) => e.id)).toEqual([
      "src/App.tsx->src/components/index.ts",
      "src/App.tsx->src/styles.css",
    ]);
  });

  it("handles a new file, a deleted file, a renamed file and a non-TypeScript change together", async () => {
    const repo = createRepoFromFixture("basic-app");
    repo.write("src/utils/date.ts", 'import { formatLabel } from "./format";\nexport const today = formatLabel("now");\n');
    repo.remove("src/utils/lazy.ts");
    repo.move("src/components/Button.tsx", "src/components/PrimaryButton.tsx");
    repo.write("src/components/index.ts", 'export { Button } from "./PrimaryButton";\n');
    repo.write("src/styles.css", "body { margin: 4px; }\n");

    const graph = expectGraph(await new ProjectState(repo.root).refresh());

    expect(nodeSummary(graph)).toEqual([
      "src/components/PrimaryButton.tsx renamed",
      "src/components/index.ts changed",
      "src/styles.css changed (non-TS)",
      "src/utils/date.ts changed",
      "src/utils/format.ts unchangedImport",
      "src/utils/lazy.ts deleted",
    ]);
    expect(graph.nodes.find((n) => n.status === "renamed")?.oldPath).toBe("src/components/Button.tsx");
    expect(graph.edges.map((e) => e.id)).toEqual([
      "src/components/PrimaryButton.tsx->src/utils/format.ts",
      "src/components/index.ts->src/components/PrimaryButton.tsx",
      "src/utils/date.ts->src/utils/format.ts",
    ]);
  });

  it("gives a changed .js file no outgoing arrows", async () => {
    const repo = createRepoFromFixture("basic-app");
    repo.write("src/legacy.js", 'import { formatLabel } from "./utils/format.js";\nexport const legacy = formatLabel("new");\n');

    const graph = expectGraph(await new ProjectState(repo.root).refresh());
    expect(nodeSummary(graph)).toEqual(["src/legacy.js changed (non-TS)"]);
    expect(graph.edges).toEqual([]);
  });

  it("drops the arrow when an import is removed, and the grayed-out node with it", async () => {
    const repo = createRepoFromFixture("basic-app");
    const projectState = new ProjectState(repo.root);
    repo.write("src/main.ts", 'import { App } from "./App";\nconsole.log(App);\n');
    expect(expectGraph(await projectState.refresh()).edges.map((e) => e.target)).toEqual(["src/App.tsx"]);

    repo.write("src/main.ts", "console.log(1);\n");
    const graph = expectGraph(await projectState.refresh());
    expect(nodeSummary(graph)).toEqual(["src/main.ts changed"]);
    expect(graph.edges).toEqual([]);
  });

  it("carries sessionPart, baseCommit and errors from git into the graph", async () => {
    const repo = createRepoFromFixture("basic-app");
    repo.write("src/types.ts", "export type User = { id: string };\n");
    const projectState = new ProjectState(repo.root);
    const atLaunch = expectGraph(await projectState.refresh());
    expect(atLaunch.sessionPart).toBe(1);
    expect(atLaunch.errors.map((e) => e.code)).toEqual(["dirtyAtLaunch"]);
    expect(atLaunch.agentOutput).toBeNull();

    const head = repo.commitAll();
    const after = expectGraph(await projectState.refresh());
    expect(after).toMatchObject({ sessionPart: 2, baseCommit: head, isClean: true, errors: [], nodes: [] });
  });
});

describe("ProjectState without a usable repo", () => {
  it("sends no graph for a folder that is not a git repository", async () => {
    expect(await new ProjectState(makeTempDir("diffviz-plain-")).refresh()).toEqual({ repo: "notGitRepo", graph: null, activity: null });
  });

  it("sends no graph for a repository with no commits", async () => {
    expect(await new ProjectState(createRepo(null).root).refresh()).toEqual({ repo: "noCommits", graph: null, activity: null });
  });
});

describe("ProjectState refresh loop", () => {
  it("runs overlapping refreshes one at a time and ends on the latest state", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const projectState = new ProjectState(repo.root);
    const seen: AppState[] = [];
    projectState.onUpdate((state) => seen.push(state));

    const first = projectState.refresh();
    repo.write("a.ts", "changed during the first refresh");
    const second = projectState.refresh();
    const third = projectState.refresh();

    // The second and third calls join the running refresh instead of starting their own.
    expect(second).toBe(first);
    expect(third).toBe(first);
    const final = expectGraph(await first);
    expect(nodeSummary(final)).toEqual(["a.ts changed"]);
    // At most two passes: the one already running, plus one rerun for the requests.
    expect(seen.length).toBeLessThanOrEqual(2);
    expect(seen.at(-1)).toEqual(await first);
  });

  it("starts a new loop for a refresh after the previous one finished", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const projectState = new ProjectState(repo.root);
    const first = projectState.refresh();
    await first;
    expect(projectState.refresh()).not.toBe(first);
  });

  it("stops notifying a listener after it unsubscribes", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const projectState = new ProjectState(repo.root);
    let calls = 0;
    const unsubscribe = projectState.onUpdate(() => calls++);

    await projectState.refresh();
    unsubscribe();
    await projectState.refresh();

    expect(calls).toBe(1);
  });
});
