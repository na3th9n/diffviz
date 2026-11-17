import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldIgnore, watchProject, type ProjectWatcher } from "../src/server/watcher.ts";
import { createRepo } from "./helpers/gitRepo.ts";

describe("shouldIgnore", () => {
  const root = path.join("/", "work", "app");
  const gitDir = path.join(root, ".git");
  const at = (...parts: string[]) => path.join(root, ...parts);

  it("watches ordinary project files and folders", () => {
    expect(shouldIgnore(root, root, gitDir)).toBe(false);
    expect(shouldIgnore(at("src", "App.tsx"), root, gitDir)).toBe(false);
  });

  it("skips node_modules at any depth and the App's .diffviz folder", () => {
    expect(shouldIgnore(at("node_modules", "react", "index.js"), root, gitDir)).toBe(true);
    expect(shouldIgnore(at("packages", "ui", "node_modules"), root, gitDir)).toBe(true);
    expect(shouldIgnore(at(".diffviz", "current.json"), root, gitDir)).toBe(true);
  });

  it("inside .git, only watches the files that change on a commit", () => {
    expect(shouldIgnore(at(".git"), root, gitDir)).toBe(false);
    expect(shouldIgnore(at(".git", "HEAD"), root, gitDir)).toBe(false);
    expect(shouldIgnore(at(".git", "refs", "heads", "main"), root, gitDir)).toBe(false);
    expect(shouldIgnore(at(".git", "packed-refs"), root, gitDir)).toBe(false);
    expect(shouldIgnore(at(".git", "index"), root, gitDir)).toBe(true);
    expect(shouldIgnore(at(".git", "objects", "ab", "cdef"), root, gitDir)).toBe(true);
    expect(shouldIgnore(at(".git", "logs", "HEAD"), root, gitDir)).toBe(true);
  });

  it("applies the same rules to a .git folder above the project root", () => {
    const repoRoot = path.join("/", "work", "monorepo");
    const outerGit = path.join(repoRoot, ".git");
    const projectRoot = path.join(repoRoot, "apps", "web");
    expect(shouldIgnore(path.join(outerGit, "HEAD"), projectRoot, outerGit)).toBe(false);
    expect(shouldIgnore(path.join(outerGit, "objects", "ab"), projectRoot, outerGit)).toBe(true);
  });

  it("watches a .git folder created after launch, before the App knows about it", () => {
    expect(shouldIgnore(at(".git", "HEAD"), root, null)).toBe(false);
    expect(shouldIgnore(at(".git", "objects"), root, null)).toBe(true);
  });
});

describe("watchProject", () => {
  let watcher: ProjectWatcher | undefined;
  afterEach(async () => {
    await watcher?.close();
    watcher = undefined;
  });

  it("calls onChange once for a burst of file changes", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const onChange = vi.fn();
    watcher = watchProject({ root: repo.root, gitDir: path.join(repo.root, ".git"), onChange, debounceMs: 100 });
    await watcher.ready;

    repo.write("a.ts", "1");
    repo.write("b.ts", "2");
    repo.write("src/c.ts", "3");

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange when a commit is made", async () => {
    const repo = createRepo({ "a.ts": "a" });
    repo.write("a.ts", "changed");
    const onChange = vi.fn();
    watcher = watchProject({ root: repo.root, gitDir: path.join(repo.root, ".git"), onChange, debounceMs: 50 });
    await watcher.ready;

    repo.git("add", "--all");  // only touches .git/index and objects, which are ignored
    await new Promise((resolve) => setTimeout(resolve, 300));
    onChange.mockClear();

    repo.git("commit", "--quiet", "-m", "commit");  // moves refs/heads/main
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("ignores writes to the App's .diffviz folder", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const onChange = vi.fn();
    watcher = watchProject({ root: repo.root, gitDir: path.join(repo.root, ".git"), onChange, debounceMs: 50 });
    await watcher.ready;

    repo.write(".diffviz/current.json", "{}");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onChange).not.toHaveBeenCalled();
  });
});
