// Records a session part of this repository for the demo site.
//
//   node scripts/record-demo.ts <base commit> <head commit> <current.json> <out.json>
//
// Builds the graph exactly as the App would during that session part: HEAD at
// <base>, the files on disk as they are at <head>, and <current.json> as the
// agent's output. The result is what the server would send over SSE, plus the
// project info, so the demo page can render it with no server.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectState } from "../src/server/projectState.ts";
import type { AppState, ProjectInfo } from "../src/shared/types.ts";

export type DemoRecording = {
  project: ProjectInfo;
  state: AppState;
  recordedFrom: { base: string; head: string };
};

const [base, head, agentOutputFile, outFile] = process.argv.slice(2);
if (!base || !head || !agentOutputFile || !outFile) {
  console.error("Usage: node scripts/record-demo.ts <base commit> <head commit> <current.json> <out.json>");
  process.exit(1);
}

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "diffviz-record-"));
const worktree = path.join(tempRoot, "diffviz");

try {
  git(repoRoot, "worktree", "add", "--quiet", "--detach", worktree, base);
  // Files and index at <head>, HEAD still at <base>: the tree the App saw just before the commit.
  git(worktree, "read-tree", "-u", "--reset", head);
  mkdirSync(path.join(worktree, ".diffviz"));
  cpSync(agentOutputFile, path.join(worktree, ".diffviz", "current.json"));

  const state = await new ProjectState(worktree).refresh();
  if (state.repo !== "ready" || state.graph === null) throw new Error(`Expected a graph, got repo "${state.repo}"`);

  const recording: DemoRecording = {
    project: { name: "diffviz", displayPath: "~/projects/diffviz" },
    state: {
      ...state,
      graph: {
        ...state.graph,
        // The worktree is "dirty at launch" only because of how it is made here;
        // in the real session the App was started on a clean tree.
        errors: state.graph.errors.filter((error) => error.code !== "dirtyAtLaunch"),
      },
      // The recording has no hooks, so this is set to match the session it shows.
      activity: { promptCount: 3, aiOutputAfterPrompt: 3 },
    },
    recordedFrom: { base: git(repoRoot, "rev-parse", "--short", base), head: git(repoRoot, "rev-parse", "--short", head) },
  };
  writeFileSync(outFile, JSON.stringify(recording, null, 2) + "\n");
  const graph = recording.state.graph!;
  console.log(`Recorded ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.agentOutput?.layers.length ?? 0} layers to ${outFile}`);
} finally {
  git(repoRoot, "worktree", "remove", "--force", worktree);
  rmSync(tempRoot, { recursive: true, force: true });
}
