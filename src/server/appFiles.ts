import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// The App's own data folder in the project. Never reported as a change, or the
// App's own writes would make the tree look dirty and show up in the graph.
// Kept free of heavy imports: the hook script loads it on every prompt.
export const APP_DIR = ".diffviz";

// Written while the server runs, so the Claude Code hooks can find its port.
const SERVER_INFO_FILE = "server.json";

export type ServerInfo = { port: number; pid: number };

export function appPath(projectRoot: string, ...parts: string[]): string {
  return path.join(projectRoot, APP_DIR, ...parts);
}

export async function writeServerInfo(projectRoot: string, info: ServerInfo): Promise<void> {
  await mkdir(appPath(projectRoot), { recursive: true });
  await writeFile(appPath(projectRoot, SERVER_INFO_FILE), JSON.stringify(info) + "\n");
}

// Returns null when no server is running here (no file, or one we can't read).
export async function readServerInfo(projectRoot: string): Promise<ServerInfo | null> {
  let text: string;
  try {
    text = await readFile(appPath(projectRoot, SERVER_INFO_FILE), "utf8");
  } catch {
    return null;  // the App is not running in this project
  }
  try {
    const info = JSON.parse(text) as Partial<ServerInfo>;
    return typeof info.port === "number" && typeof info.pid === "number" ? { port: info.port, pid: info.pid } : null;
  } catch {
    return null;  // half-written or damaged: treat as not running
  }
}

// Only removes the file if it still belongs to this process: a second copy of
// the App started in the same folder may have replaced it.
export async function removeServerInfo(projectRoot: string, pid: number): Promise<void> {
  const info = await readServerInfo(projectRoot);
  if (info?.pid === pid) await rm(appPath(projectRoot, SERVER_INFO_FILE), { force: true });
}
