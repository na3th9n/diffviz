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
    const status = expectReady(await new GitTracker(repo.root).refresh());

    expect(status.isClean).toBe(true);
    expect(status.changes).toEqual([]);
    expect(status.errors).toEqual([]);
    expect(status.baseCommit).toBe(repo.git("rev-parse", "HEAD").trim());
  });

  it("does not warn when the tree becomes dirty after launch", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const tracker = new GitTracker(repo.root);
    await tracker.refresh();

    repo.write("a.ts", "changed");
    const status = expectReady(await tracker.refresh());

    expect(status.isClean).toBe(false);
    expect(status.errors).toEqual([]);
  });

  it("warns when the tree is dirty at launch, until the next commit", async () => {
    const repo = createRepo({ "a.ts": "a" });
    repo.write("a.ts", "changed before launch");
    const tracker = new GitTracker(repo.root);

    const atLaunch = expectReady(await tracker.refresh());
    expect(atLaunch.errors.map((e) => e.code)).toEqual(["dirtyAtLaunch"]);

    // More edits do not clear it...
    repo.write("b.ts", "b");
    expect(expectReady(await tracker.refresh()).errors.map((e) => e.code)).toEqual(["dirtyAtLaunch"]);

    // ...a commit does, for good.
    repo.commitAll();
    expect(expectReady(await tracker.refresh()).errors).toEqual([]);
    repo.write("c.ts", "c");
    expect(expectReady(await tracker.refresh()).errors).toEqual([]);
  });

  it("clears the dirty-at-launch warning after a partial commit, even though the tree is still dirty", async () => {
    const repo = createRepo({ "a.ts": "a", "b.ts": "b" });
    repo.write("a.ts", "a changed before launch");
    repo.write("b.ts", "b changed before launch");
    const tracker = new GitTracker(repo.root);
    expect(expectReady(await tracker.refresh()).errors.map((e) => e.code)).toEqual(["dirtyAtLaunch"]);

    // Commit only a.ts; b.ts stays modified.
    repo.git("add", "a.ts");
    repo.git("commit", "--quiet", "-m", "only a");
    const status = expectReady(await tracker.refresh());

    expect(status.baseCommit).toBe(repo.git("rev-parse", "HEAD").trim());
    expect(status.isClean).toBe(false);
    expect(status.changes).toEqual([{ path: "b.ts", change: "modified" }]);
    // The warning is decided once at launch; any new commit turns it off for good.
    expect(status.errors).toEqual([]);
  });

  it("starts a new base after a commit", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const tracker = new GitTracker(repo.root);
    const first = expectReady(await tracker.refresh());

    repo.write("a.ts", "changed");
    const newHead = repo.commitAll();
    const afterCommit = expectReady(await tracker.refresh());

    expect(afterCommit.baseCommit).toBe(newHead);
    expect(afterCommit.baseCommit).not.toBe(first.baseCommit);
    expect(afterCommit.isClean).toBe(true);
  });

  it("switches to ready when a folder becomes a repo while the App runs", async () => {
    const root = makeTempDir("diffviz-later-");
    const tracker = new GitTracker(root);
    expect((await tracker.refresh()).kind).toBe("notGitRepo");

    const repo = createRepo(null, root);
    expect((await tracker.refresh()).kind).toBe("noCommits");

    repo.write("a.ts", "a");
    repo.commitAll();
    const status = expectReady(await tracker.refresh());
    expect(status.isClean).toBe(true);
    expect(status.errors).toEqual([]);  // not "dirty at launch": it was clean when it became a repo
  });

  it("runs overlapping refreshes one at a time and ends on the latest state", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const tracker = new GitTracker(repo.root);
    const seen: GitStatus[] = [];
    tracker.onUpdate((status) => seen.push(status));

    const first = tracker.refresh();
    repo.write("a.ts", "changed during the first refresh");
    const second = tracker.refresh();
    const third = tracker.refresh();

    // The second and third calls join the running refresh instead of starting their own.
    expect(second).toBe(first);
    expect(third).toBe(first);
    const final = expectReady(await first);
    expect(final.changes).toEqual([{ path: "a.ts", change: "modified" }]);
    // At most two passes: the one already running, plus one rerun for the requests.
    expect(seen.length).toBeLessThanOrEqual(2);
    expect(seen.at(-1)).toEqual(final);
  });

  it("stops notifying a listener after it unsubscribes", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const tracker = new GitTracker(repo.root);
    let calls = 0;
    const unsubscribe = tracker.onUpdate(() => calls++);

    await tracker.refresh();
    unsubscribe();
    await tracker.refresh();

    expect(calls).toBe(1);
  });
});
