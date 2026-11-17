import { describe, expect, it } from "vitest";
import type { GitStatus } from "../src/shared/types.ts";
import { GitTracker } from "../src/server/gitTracker.ts";
import { createRepo, makeTempDir } from "./helpers/gitRepo.ts";

function expectReady(status: GitStatus) {
  if (status.kind !== "ready") throw new Error(`Expected a ready status, got "${status.kind}"`);
  return status;
}

describe("GitTracker", () => {
  it("reports a clean tree with no errors", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const status = expectReady(await new GitTracker(repo.root).readStatus());

    expect(status.isClean).toBe(true);
    expect(status.changes).toEqual([]);
    expect(status.errors).toEqual([]);
    expect(status.baseCommit).toBe(repo.git("rev-parse", "HEAD").trim());
  });

  it("does not warn when the tree becomes dirty after launch", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const tracker = new GitTracker(repo.root);
    await tracker.readStatus();

    repo.write("a.ts", "changed");
    const status = expectReady(await tracker.readStatus());

    expect(status.isClean).toBe(false);
    expect(status.errors).toEqual([]);
  });

  it("warns when the tree is dirty at launch, until the next commit", async () => {
    const repo = createRepo({ "a.ts": "a" });
    repo.write("a.ts", "changed before launch");
    const tracker = new GitTracker(repo.root);

    const atLaunch = expectReady(await tracker.readStatus());
    expect(atLaunch.errors.map((e) => e.code)).toEqual(["dirtyAtLaunch"]);

    // More edits do not clear it...
    repo.write("b.ts", "b");
    expect(expectReady(await tracker.readStatus()).errors.map((e) => e.code)).toEqual(["dirtyAtLaunch"]);

    // ...a commit does, for good.
    repo.commitAll();
    expect(expectReady(await tracker.readStatus()).errors).toEqual([]);
    repo.write("c.ts", "c");
    expect(expectReady(await tracker.readStatus()).errors).toEqual([]);
  });

  it("clears the dirty-at-launch warning after a partial commit, even though the tree is still dirty", async () => {
    const repo = createRepo({ "a.ts": "a", "b.ts": "b" });
    repo.write("a.ts", "a changed before launch");
    repo.write("b.ts", "b changed before launch");
    const tracker = new GitTracker(repo.root);
    expect(expectReady(await tracker.readStatus()).errors.map((e) => e.code)).toEqual(["dirtyAtLaunch"]);

    // Commit only a.ts; b.ts stays modified.
    repo.git("add", "a.ts");
    repo.git("commit", "--quiet", "-m", "only a");
    const status = expectReady(await tracker.readStatus());

    expect(status.baseCommit).toBe(repo.git("rev-parse", "HEAD").trim());
    expect(status.isClean).toBe(false);
    expect(status.changes).toEqual([{ path: "b.ts", change: "modified" }]);
    // The warning is decided once at launch; any new commit turns it off for good.
    expect(status.errors).toEqual([]);
  });

  it("starts a new base after a commit", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const tracker = new GitTracker(repo.root);
    const first = expectReady(await tracker.readStatus());

    repo.write("a.ts", "changed");
    const newHead = repo.commitAll();
    const afterCommit = expectReady(await tracker.readStatus());

    expect(afterCommit.baseCommit).toBe(newHead);
    expect(afterCommit.baseCommit).not.toBe(first.baseCommit);
    expect(afterCommit.isClean).toBe(true);
  });

  it("switches to ready when a folder becomes a repo while the App runs", async () => {
    const root = makeTempDir("diffviz-later-");
    const tracker = new GitTracker(root);
    expect((await tracker.readStatus()).kind).toBe("notGitRepo");

    const repo = createRepo(null, root);
    expect((await tracker.readStatus()).kind).toBe("noCommits");

    repo.write("a.ts", "a");
    repo.commitAll();
    const status = expectReady(await tracker.readStatus());
    expect(status.isClean).toBe(true);
    expect(status.errors).toEqual([]);  // not "dirty at launch": it was clean when it became a repo
  });

  it("counts session parts: 1 at launch, plus one per new commit", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const tracker = new GitTracker(repo.root);
    expect(expectReady(await tracker.readStatus()).sessionPart).toBe(1);

    repo.write("a.ts", "changed");
    expect(expectReady(await tracker.readStatus()).sessionPart).toBe(1);  // edits do not start a part

    repo.commitAll();
    expect(expectReady(await tracker.readStatus()).sessionPart).toBe(2);
    repo.commitAll();
    expect(expectReady(await tracker.readStatus()).sessionPart).toBe(3);
  });
});
