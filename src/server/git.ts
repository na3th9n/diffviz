import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { ChangeKind, FileChange } from "../shared/types.ts";

// The App's own data folder. Never reported as a change, or the App's own
// writes would make the tree look dirty and show up in the graph.
export const APP_DIR = ".diffviz";

// Limits git to the project root and leaves out the App's folder.
const PATHSPEC = ["--", ".", `:(exclude)${APP_DIR}`];

export type RepoCheck = "ready" | "notGitRepo" | "noCommits";

export async function checkRepo(root: string): Promise<RepoCheck> {
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) return "notGitRepo";
  return (await getHeadCommit(root)) === null ? "noCommits" : "ready";
}

// Returns the full hash of the last commit, or null if there are no commits yet.
export async function getHeadCommit(root: string): Promise<string | null> {
  // --verify --quiet prints nothing (instead of failing) when HEAD has no commit.
  const output = await simpleGit(root).raw(["rev-parse", "--verify", "--quiet", "HEAD"]);
  const hash = output.trim();
  return hash === "" ? null : hash;
}

// Lists every file that differs between the last commit and the files on disk,
// including new untracked files and renames.
//
// A plain `git diff HEAD` cannot see untracked files, so it misses new files
// and cannot pair a deleted file with its new name. Instead, this stages the
// whole working tree into a throwaway copy of the index and diffs that
// against HEAD. The user's real staging area is never touched.
export async function getChanges(root: string): Promise<FileChange[]> {
  return withWorkingTreeIndex(root, async (git) => {
    // --relative: paths relative to the project root, even if the repo root is higher up.
    // -z: NUL-separated output, so paths with spaces or quotes come through unchanged.
    const output = await git.raw([
      "diff", "--cached", "--find-renames", "--name-status", "-z", "--relative", "HEAD", ...PATHSPEC,
    ]);
    return parseNameStatus(output);
  });
}

// Returns one hash that identifies the exact content of every file in the
// project (except the App's folder). It changes if and only if some file's
// content, name or presence changes, so comparing two fingerprints answers
// "did the code change in between?" without keeping copies of the files.
export async function getTreeFingerprint(root: string): Promise<string> {
  return withWorkingTreeIndex(root, async (git) => (await git.raw(["write-tree"])).trim());
}

// Stages the whole working tree into a throwaway copy of the index, runs
// `use` with a git client pointed at it, and deletes it afterwards.
async function withWorkingTreeIndex<T>(root: string, use: (git: SimpleGit) => Promise<T>): Promise<T> {
  // The temp index lives outside the project so writing it does not trigger the file watcher.
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "diffviz-index-"));
  const tempIndex = path.join(tempDir, "index");
  try {
    await seedTempIndex(root, tempIndex);
    const git = gitWithIndex(root, tempIndex);
    await git.raw(["add", "--all", ...PATHSPEC]);
    return await use(git);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// Starts the temp index as a copy of the real one. Its saved file timestamps let
// `git add` skip re-reading unchanged files. A repo can lack an index file
// (e.g. right after some clones), so fall back to building one from HEAD.
async function seedTempIndex(root: string, tempIndex: string): Promise<void> {
  const git = simpleGit(root);
  const realIndex = path.resolve(root, (await git.raw(["rev-parse", "--git-path", "index"])).trim());
  try {
    await copyFile(realIndex, tempIndex);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    await gitWithIndex(root, tempIndex).raw(["read-tree", "HEAD"]);
  }
}

function gitWithIndex(root: string, indexFile: string): SimpleGit {
  // simple-git blocks git-related environment variables unless they are named here.
  // Only the variables git needs are passed: PATH to find it, HOME for the user's
  // global config and global .gitignore.
  return simpleGit({ baseDir: root, allowEnvironment: ["GIT_INDEX_FILE"] }).env({
    ...pickDefined(process.env, ["PATH", "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "SystemRoot"]),
    GIT_INDEX_FILE: indexFile,
  });
}

// Parses `git diff --name-status -z` output. Each entry is a status code
// followed by one path, or two paths (old, new) for renames and copies:
//   "M\0b.ts\0R100\0a.ts\0moved.ts\0A\0new.ts\0"
export function parseNameStatus(output: string): FileChange[] {
  const parts = output.split("\0");
  const changes: FileChange[] = [];
  let i = 0;
  while (i < parts.length && parts[i] !== "") {
    const code = parts[i]!;
    const letter = code[0]!;
    // R (renamed) and C (copied) carry a similarity score and two paths.
    if (letter === "R" || letter === "C") {
      const oldPath = parts[i + 1];
      const newPath = parts[i + 2];
      // A missing path shows up as "" (from the trailing NUL) or undefined.
      if (!oldPath || !newPath) {
        throw new Error(`Malformed git output: "${code}" is missing its paths`);
      }
      changes.push(
        letter === "R"
          ? { path: newPath, change: "renamed", oldPath }
          : { path: newPath, change: "added" },  // a copy is a new file
      );
      i += 3;
    } else {
      const filePath = parts[i + 1];
      if (!filePath) throw new Error(`Malformed git output: "${code}" is missing its path`);
      changes.push({ path: filePath, change: changeKind(letter) });
      i += 2;
    }
  }
  return changes;
}

function changeKind(letter: string): ChangeKind {
  switch (letter) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    // M modified, T type changed (e.g. file to symlink), U unmerged (mid-merge conflict).
    case "M":
    case "T":
    case "U":
      return "modified";
    default:
      throw new Error(`Unknown git status letter: "${letter}"`);
  }
}

// Returns the absolute path of the repository's .git folder, or null outside a repo.
export async function getGitDir(root: string): Promise<string | null> {
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) return null;
  return path.resolve(root, (await git.raw(["rev-parse", "--absolute-git-dir"])).trim());
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function pickDefined(source: NodeJS.ProcessEnv, keys: string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}
