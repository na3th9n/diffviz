import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureGitExcludes, ensureHooks, ensureInstructions, GIT_EXCLUDES, runSetup, SETTINGS_FILE } from "../src/server/setup.ts";
import { createRepo, makeTempDir } from "./helpers/gitRepo.ts";

const read = (root: string, file: string) => readFileSync(path.join(root, file), "utf8");
const command = (kind: string) => `node "/x/hook.js" --diffviz-hook ${kind}`;

describe("ensureInstructions", () => {
  it("creates CLAUDE.md with the instructions block", async () => {
    const root = makeTempDir("diffviz-setup-");
    expect(await ensureInstructions(root)).toBe("created");
    const text = read(root, "CLAUDE.md");
    expect(text).toMatch(/^<!-- diffviz:start/);
    expect(text).toContain(".diffviz/current.json");
    expect(text).toContain("schemaVersion: 1");
    expect(text.trimEnd()).toMatch(/<!-- diffviz:end -->$/);
  });

  it("appends to an existing CLAUDE.md, keeping what was there", async () => {
    const root = makeTempDir("diffviz-setup-");
    writeFileSync(path.join(root, "CLAUDE.md"), "# My project\n\nUse pnpm.\n");
    expect(await ensureInstructions(root)).toBe("updated");
    expect(read(root, "CLAUDE.md")).toMatch(/^# My project\n\nUse pnpm.\n\n<!-- diffviz:start/);
  });

  it("does nothing the second time", async () => {
    const root = makeTempDir("diffviz-setup-");
    await ensureInstructions(root);
    const once = read(root, "CLAUDE.md");
    expect(await ensureInstructions(root)).toBeNull();
    expect(read(root, "CLAUDE.md")).toBe(once);
  });

  it("replaces an out-of-date block in place, without touching the rest", async () => {
    const root = makeTempDir("diffviz-setup-");
    await ensureInstructions(root);
    const current = read(root, "CLAUDE.md");
    const start = current.indexOf("\n") + 1;
    const end = current.indexOf("<!-- diffviz:end -->");
    writeFileSync(path.join(root, "CLAUDE.md"), "Before.\n\n" + current.slice(0, start) + "old text\n" + current.slice(end) + "\nAfter.\n");

    expect(await ensureInstructions(root)).toBe("updated");
    const updated = read(root, "CLAUDE.md");
    expect(updated).toBe("Before.\n\n" + current + "\nAfter.\n");
  });
});

describe("ensureHooks", () => {
  it("creates the local settings with a prompt and a stop hook", async () => {
    const root = makeTempDir("diffviz-setup-");
    expect(await ensureHooks(root, command)).toEqual({ kind: "changed", change: "created" });
    expect(JSON.parse(read(root, SETTINGS_FILE))).toEqual({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: command("prompt"), timeout: 10 }] }],
        Stop: [{ hooks: [{ type: "command", command: command("stop"), timeout: 10 }] }],
      },
    });
  });

  it("keeps the user's own settings and hooks, and replaces an older diffviz hook", async () => {
    const root = makeTempDir("diffviz-setup-");
    mkdirSync(path.join(root, ".claude"));
    const theirs = { type: "command", command: "say done" };
    writeFileSync(
      path.join(root, SETTINGS_FILE),
      JSON.stringify({
        permissions: { allow: ["Bash(npm test)"] },
        hooks: {
          Stop: [{ hooks: [theirs, { type: "command", command: 'node "/old/hook.js" --diffviz-hook stop' }] }],
          PreToolUse: [{ matcher: "Bash", hooks: [theirs] }],
        },
      }),
    );

    expect(await ensureHooks(root, command)).toEqual({ kind: "changed", change: "updated" });
    const settings = JSON.parse(read(root, SETTINGS_FILE));
    expect(settings.permissions).toEqual({ allow: ["Bash(npm test)"] });
    expect(settings.hooks.PreToolUse).toEqual([{ matcher: "Bash", hooks: [theirs] }]);
    expect(settings.hooks.Stop).toEqual([
      { hooks: [theirs] },
      { hooks: [{ type: "command", command: command("stop"), timeout: 10 }] },
    ]);
  });

  it("does nothing when the hooks are already up to date", async () => {
    const root = makeTempDir("diffviz-setup-");
    await ensureHooks(root, command);
    expect(await ensureHooks(root, command)).toEqual({ kind: "unchanged" });
  });

  it("never overwrites a settings file it can't read", async () => {
    const root = makeTempDir("diffviz-setup-");
    mkdirSync(path.join(root, ".claude"));
    writeFileSync(path.join(root, SETTINGS_FILE), "{ not json");
    const result = await ensureHooks(root, command);
    expect(result.kind).toBe("skipped");
    expect(read(root, SETTINGS_FILE)).toBe("{ not json");
  });
});

describe("ensureGitExcludes", () => {
  it("adds the App's files to .git/info/exclude once", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const gitDir = path.join(repo.root, ".git");
    await ensureGitExcludes(gitDir);
    await ensureGitExcludes(gitDir);
    const lines = read(gitDir, "info/exclude").split("\n");
    for (const pattern of GIT_EXCLUDES) expect(lines.filter((line) => line === pattern)).toHaveLength(1);
  });

  it("hides the App's files from git status", async () => {
    const repo = createRepo({ "a.ts": "a" });
    await ensureGitExcludes(path.join(repo.root, ".git"));
    repo.write(".diffviz/current.json", "{}");
    repo.write(".claude/settings.local.json", "{}");
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});

describe("runSetup", () => {
  it("sets up a git repository and reports what it changed", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const result = await runSetup(repo.root, path.join(repo.root, ".git"));
    expect(result).toEqual({
      changes: [
        { file: "CLAUDE.md", change: "created" },
        { file: SETTINGS_FILE, change: "created" },
      ],
      warnings: [],
    });
    // The hook command points at the real hook script.
    const settings = JSON.parse(read(repo.root, SETTINGS_FILE));
    const hookPath = /node "(.+)" --diffviz-hook stop/.exec(settings.hooks.Stop[0].hooks[0].command)?.[1];
    expect(hookPath && existsSync(hookPath)).toBe(true);
  });

  it("does nothing outside a git repository", async () => {
    const root = makeTempDir("diffviz-setup-");
    expect(await runSetup(root, null)).toEqual({ changes: [], warnings: [] });
    expect(existsSync(path.join(root, "CLAUDE.md"))).toBe(false);
  });
});
