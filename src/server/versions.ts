import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./git.ts";

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
// part, exactly as the agent wrote it. Returns the new file's path, or null
// when the text is the same as the latest saved version (one save can reach
// the App twice, and an identical copy adds nothing to the history).
export async function saveVersion(projectRoot: string, baseCommit: string, text: string): Promise<string | null> {
  const dir = path.join(partDir(projectRoot, baseCommit), "versions");
  await mkdir(dir, { recursive: true });

  const numbers = (await readdir(dir))
    .map((name) => VERSION_FILE.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  const latest = numbers.at(-1);

  if (latest !== undefined) {
    const latestText = await readFile(path.join(dir, versionName(latest)), "utf8");
    if (latestText === text) return null;
  }

  const file = path.join(dir, versionName((latest ?? 0) + 1));
  // "wx" fails instead of overwriting, so a saved version is never replaced.
  await writeFile(file, text, { flag: "wx" });
  return file;
}

function versionName(n: number): string {
  return `${String(n).padStart(NUMBER_WIDTH, "0")}.json`;
}
