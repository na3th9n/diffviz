import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./appFiles.ts";

// Each session part's data lives in .diffviz/parts/<base commit hash>/. The
// folder is named by commit, not by sessionPart, because sessionPart restarts
// at 1 every time the App launches and two runs would share "part 1".
export function partDir(projectRoot: string, baseCommit: string): string {
  return path.join(projectRoot, APP_DIR, "parts", baseCommit);
}

// Version files are numbered in the order they were saved: 0001.json, 0002.json, ...
const VERSION_FILE = /^(\d+)\.json$/;
const NUMBER_WIDTH = 4;

// Saves the text of a valid current.json as the next version of this session
// part, exactly as the agent wrote it. Returns the new file's name, or null
// when the text is the same as the latest saved version (one save can reach
// the App twice, and an identical copy adds nothing to the history).
export async function saveVersion(projectRoot: string, baseCommit: string, text: string): Promise<string | null> {
  const dir = versionsDir(projectRoot, baseCommit);
  await mkdir(dir, { recursive: true });

  const latest = await latestVersionNumber(dir);
  if (latest !== null && (await readFile(path.join(dir, versionName(latest)), "utf8")) === text) return null;

  const name = versionName((latest ?? 0) + 1);
  // "wx" fails instead of overwriting, so a saved version is never replaced.
  await writeFile(path.join(dir, name), text, { flag: "wx" });
  return name;
}

// The text of the newest saved version of a session part, or null if it has none.
export async function latestVersionText(projectRoot: string, baseCommit: string): Promise<string | null> {
  const dir = versionsDir(projectRoot, baseCommit);
  let latest: number | null;
  try {
    latest = await latestVersionNumber(dir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  return latest === null ? null : readFile(path.join(dir, versionName(latest)), "utf8");
}

function versionsDir(projectRoot: string, baseCommit: string): string {
  return path.join(partDir(projectRoot, baseCommit), "versions");
}

async function latestVersionNumber(dir: string): Promise<number | null> {
  const numbers = (await readdir(dir))
    .map((name) => VERSION_FILE.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return numbers.length === 0 ? null : Math.max(...numbers);
}

function versionName(n: number): string {
  return `${String(n).padStart(NUMBER_WIDTH, "0")}.json`;
}
