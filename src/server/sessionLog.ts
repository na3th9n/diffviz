import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GraphState, SessionActivity } from "../shared/types.ts";
import { partDir } from "./versions.ts";

// One line per event in .diffviz/parts/<base commit>/log.jsonl, oldest first.
// Together with the saved versions it is the history of the session part:
// what was asked, what the agent answered, and which current.json version
// followed which prompt.
export type LogEntry =
  | { type: "prompt"; time: string; prompt: number; sessionId: string | null; text: string }
  | { type: "response"; time: string; afterPrompt: number; sessionId: string | null; text: string | null }
  | { type: "aiOutput"; time: string; afterPrompt: number; version: string };

const LOG_FILE = "log.jsonl";
const FINAL_GRAPH_FILE = "final.json";

// Appends to the current session part's log and keeps the counts the status
// bar shows. Counts are read back from the file when a part starts, so they
// survive a restart of the App.
export class SessionLog {
  private readonly root: string;
  private baseCommit: string | null = null;
  private promptCount = 0;
  private aiOutputAfterPrompt: number | null = null;
  // Writes happen one at a time, in the order they were asked for. A response
  // logged right after a prompt must see that prompt counted, even though both
  // arrive from the hooks at almost the same moment.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(root: string) {
    this.root = root;
  }

  startPart(baseCommit: string): Promise<void> {
    return this.inOrder(async () => {
      if (baseCommit === this.baseCommit) return;
      this.baseCommit = baseCommit;
      this.promptCount = 0;
      this.aiOutputAfterPrompt = null;
      for (const entry of await readLog(this.root, baseCommit)) this.count(entry);
    });
  }

  // Each entry is built when its turn comes, so its numbers are up to date.
  logPrompt(text: string, sessionId: string | null): Promise<void> {
    return this.append(() => ({ type: "prompt", time: now(), prompt: this.promptCount + 1, sessionId, text }));
  }

  logResponse(text: string | null, sessionId: string | null): Promise<void> {
    return this.append(() => ({ type: "response", time: now(), afterPrompt: this.promptCount, sessionId, text }));
  }

  logAiOutput(version: string): Promise<void> {
    return this.append(() => ({ type: "aiOutput", time: now(), afterPrompt: this.promptCount, version }));
  }

  activity(): SessionActivity {
    return { promptCount: this.promptCount, aiOutputAfterPrompt: this.aiOutputAfterPrompt };
  }

  private append(makeEntry: () => LogEntry): Promise<void> {
    return this.inOrder(async () => {
      if (this.baseCommit === null) throw new Error("No session part has started");
      const entry = makeEntry();
      const dir = partDir(this.root, this.baseCommit);
      await mkdir(dir, { recursive: true });
      await appendFile(path.join(dir, LOG_FILE), JSON.stringify(entry) + "\n");
      this.count(entry);
    });
  }

  // Runs `task` after every earlier one has finished. A failed task is
  // reported to its own caller and doesn't stop the ones after it.
  private inOrder<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  private count(entry: LogEntry): void {
    if (entry.type === "prompt") this.promptCount = Math.max(this.promptCount, entry.prompt);
    if (entry.type === "aiOutput") this.aiOutputAfterPrompt = entry.afterPrompt;
  }
}

export async function readLog(root: string, baseCommit: string): Promise<LogEntry[]> {
  let text: string;
  try {
    text = await readFile(path.join(partDir(root, baseCommit), LOG_FILE), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const entries: LogEntry[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      entries.push(JSON.parse(line) as LogEntry);
    } catch {
      // A line cut off by a crash; the rest of the log is still useful.
    }
  }
  return entries;
}

// Saves the last graph of a session part when a commit ends it, next to its
// versions and log.
export async function saveFinalGraph(root: string, graph: GraphState, endCommit: string): Promise<string> {
  const dir = partDir(root, graph.baseCommit);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, FINAL_GRAPH_FILE);
  await writeFile(file, JSON.stringify({ endCommit, savedAt: now(), graph }, null, 2) + "\n");
  return file;
}

function now(): string {
  return new Date().toISOString();
}
