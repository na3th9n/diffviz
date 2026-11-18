import { mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepo, getChanges, getHeadCommit, getTreeFingerprint, parseNameStatus } from "../src/server/git.ts";
import { createRepo, makeTempDir, sourceFile } from "./helpers/gitRepo.ts";

describe("parseNameStatus", () => {
  it("parses modified, added, deleted and renamed entries", () => {
    const output = "M\0b.ts\0A\0new.ts\0D\0gone.ts\0R100\0a.ts\0moved.ts\0";
    expect(parseNameStatus(output)).toEqual([
      { path: "b.ts", change: "modified" },
      { path: "new.ts", change: "added" },
      { path: "gone.ts", change: "deleted" },
      { path: "moved.ts", change: "renamed", oldPath: "a.ts" },
    ]);
  });

  it("keeps paths with spaces and quotes unchanged", () => {
    expect(parseNameStatus('A\0my "file".ts\0')).toEqual([{ path: 'my "file".ts', change: "added" }]);
  });

  it("returns nothing for empty output", () => {
    expect(parseNameStatus("")).toEqual([]);
  });

  it("treats a copy as a new file and a type change as modified", () => {
    expect(parseNameStatus("C75\0a.ts\0copy.ts\0T\0link.ts\0")).toEqual([
      { path: "copy.ts", change: "added" },
      { path: "link.ts", change: "modified" },
    ]);
  });

  it("throws on output it does not understand", () => {
    expect(() => parseNameStatus("X\0a.ts\0")).toThrow(/Unknown git status/);
    expect(() => parseNameStatus("R100\0a.ts\0")).toThrow(/Malformed/);
  });
});

describe("checkRepo and getHeadCommit", () => {
  it("reports a folder that is not a git repository", async () => {
    expect(await checkRepo(makeTempDir("diffviz-plain-"))).toBe("notGitRepo");
  });

  it("reports a repository with no commits", async () => {
    const repo = createRepo(null);
    expect(await checkRepo(repo.root)).toBe("noCommits");
    expect(await getHeadCommit(repo.root)).toBeNull();
  });

  it("returns the HEAD hash of a repository with commits", async () => {
    const repo = createRepo({ "a.ts": "a" });
    expect(await checkRepo(repo.root)).toBe("ready");
    expect(await getHeadCommit(repo.root)).toBe(repo.git("rev-parse", "HEAD").trim());
  });
});

describe("getChanges", () => {
  it("returns nothing for a clean tree", async () => {
    const repo = createRepo({ "a.ts": "a" });
    expect(await getChanges(repo.root)).toEqual([]);
  });

  it("finds modified, new untracked, and deleted files without staging them", async () => {
    const repo = createRepo({ "a.ts": "a", "b.ts": "b" });
    repo.write("a.ts", "a changed");
    repo.write("src/new.ts", "new");
    repo.remove("b.ts");

    expect(sortByPath(await getChanges(repo.root))).toEqual([
      { path: "a.ts", change: "modified" },
      { path: "b.ts", change: "deleted" },
      { path: "src/new.ts", change: "added" },
    ]);
  });

  it("detects a rename done with a plain move, not git mv", async () => {
    const repo = createRepo({ "src/old.ts": sourceFile("x") });
    repo.move("src/old.ts", "src/renamed.ts");

    expect(await getChanges(repo.root)).toEqual([
      { path: "src/renamed.ts", change: "renamed", oldPath: "src/old.ts" },
    ]);
  });

  it("detects a rename done with git mv", async () => {
    const repo = createRepo({ "old.ts": sourceFile("x") });
    repo.git("mv", "old.ts", "new.ts");

    expect(await getChanges(repo.root)).toEqual([{ path: "new.ts", change: "renamed", oldPath: "old.ts" }]);
  });

  it("includes changes that are already staged", async () => {
    const repo = createRepo({ "a.ts": "a" });
    repo.write("a.ts", "staged");
    repo.git("add", "a.ts");

    expect(await getChanges(repo.root)).toEqual([{ path: "a.ts", change: "modified" }]);
  });

  it("skips gitignored files and the App's .diffviz folder", async () => {
    const repo = createRepo({ ".gitignore": "dist/\n", "a.ts": "a" });
    repo.write("dist/bundle.js", "built");
    repo.write(".diffviz/current.json", "{}");

    expect(await getChanges(repo.root)).toEqual([]);
  });

  it("never changes the user's real staging area", async () => {
    const repo = createRepo({ "a.ts": sourceFile("a"), "b.ts": "b" });
    repo.write("b.ts", "b changed");
    repo.write("new.ts", "new");
    repo.move("a.ts", "moved.ts");
    const before = repo.git("status", "--porcelain");

    await getChanges(repo.root);

    expect(repo.git("status", "--porcelain")).toBe(before);
  });

  it("reports paths relative to a project root inside a bigger repo, and only its changes", async () => {
    const repo = createRepo({ "apps/web/src/App.tsx": "web", "apps/api/server.ts": "api" });
    repo.write("apps/web/src/App.tsx", "web changed");
    repo.write("apps/api/server.ts", "api changed");

    const webRoot = path.join(repo.root, "apps", "web");
    expect(await getChanges(webRoot)).toEqual([{ path: "src/App.tsx", change: "modified" }]);
  });

  it("does not report an empty new folder", async () => {
    const repo = createRepo({ "a.ts": "a" });
    mkdirSync(path.join(repo.root, "empty"));
    expect(await getChanges(repo.root)).toEqual([]);
  });
});

function sortByPath<T extends { path: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.path.localeCompare(b.path));
}

describe("getTreeFingerprint", () => {
  it("stays the same while nothing changes", async () => {
    const repo = createRepo({ "a.ts": "a" });
    expect(await getTreeFingerprint(repo.root)).toBe(await getTreeFingerprint(repo.root));
  });

  it("changes when a file is edited, added or deleted", async () => {
    const repo = createRepo({ "a.ts": "a", "b.ts": "b" });
    const seen = new Set([await getTreeFingerprint(repo.root)]);
    repo.write("a.ts", "a2");
    seen.add(await getTreeFingerprint(repo.root));
    repo.write("new.ts", "n");  // untracked
    seen.add(await getTreeFingerprint(repo.root));
    repo.remove("b.ts");
    seen.add(await getTreeFingerprint(repo.root));
    expect(seen.size).toBe(4);
  });

  it("ignores the App's .diffviz folder", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const before = await getTreeFingerprint(repo.root);
    repo.write(".diffviz/current.json", "{}");
    expect(await getTreeFingerprint(repo.root)).toBe(before);
  });
});

