import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// A real git repository in a temp folder, for fixture tests.
export type TestRepo = {
  root: string;
  git: (...args: string[]) => string;
  write: (file: string, content: string) => void;
  remove: (file: string) => void;
  move: (from: string, to: string) => void;
  commitAll: (message?: string) => string;  // returns the new HEAD hash
};

// Settings that keep the tests independent of the machine's own git config.
const ISOLATED_CONFIG = [
  "-c", "user.name=diffviz test",
  "-c", "user.email=test@example.com",
  "-c", "commit.gpgsign=false",
  "-c", "core.hooksPath=/dev/null",
];

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Creates a repo with `files` committed as its first commit (or no commit if `files` is null).
export function createRepo(files: Record<string, string> | null, root = makeTempDir("diffviz-repo-")): TestRepo {
  const git = (...args: string[]) =>
    execFileSync("git", [...ISOLATED_CONFIG, ...args], { cwd: root, encoding: "utf8" });

  const repo: TestRepo = {
    root,
    git,
    write: (file, content) => {
      const full = path.join(root, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    },
    remove: (file) => rmSync(path.join(root, file)),
    move: (from, to) => {
      const target = path.join(root, to);
      mkdirSync(path.dirname(target), { recursive: true });
      renameSync(path.join(root, from), target);
    },
    commitAll: (message = "commit") => {
      git("add", "--all");
      git("commit", "--quiet", "--allow-empty", "-m", message);
      return git("rev-parse", "HEAD").trim();
    },
  };

  git("init", "--quiet", "--initial-branch=main");
  if (files) {
    for (const [file, content] of Object.entries(files)) repo.write(file, content);
    repo.commitAll("initial");
  }
  return repo;
}

// Long enough that git's rename detection can match a moved file by content.
export function sourceFile(name: string): string {
  return Array.from({ length: 20 }, (_, i) => `export const ${name}${i} = ${i};`).join("\n") + "\n";
}
