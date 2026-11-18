#!/usr/bin/env node
// Run by Claude Code's hooks, which setup writes into .claude/settings.local.json:
//   node <this file> --diffviz-hook prompt   (UserPromptSubmit: the user sent a prompt)
//   node <this file> --diffviz-hook stop     (Stop: the agent finished its response)
// Claude Code passes the event as JSON on stdin. This forwards it to the
// running App, which logs it to the session part.
//
// It must never get in the agent's way: it always exits 0 (a non-zero exit can
// show an error or even block the agent), gives up after a short timeout, and
// does nothing when the App is not running.
import { readFile } from "node:fs/promises";
import { readServerInfo } from "./appFiles.ts";
import { lastResponseText } from "./transcript.ts";

// Marks the hook commands that belong to diffviz, so setup can find and update them.
export const HOOK_FLAG = "--diffviz-hook";
export type HookKind = "prompt" | "stop";

const REQUEST_TIMEOUT_MS = 2000;

type HookInput = {
  session_id?: unknown;
  cwd?: unknown;
  prompt?: unknown;
  transcript_path?: unknown;
};

export async function runHook(kind: HookKind, input: HookInput, env: NodeJS.ProcessEnv): Promise<void> {
  // Claude Code sets CLAUDE_PROJECT_DIR to the folder it was started in,
  // which is where the App runs too.
  const root = env.CLAUDE_PROJECT_DIR ?? stringOrNull(input.cwd) ?? process.cwd();
  const server = await readServerInfo(root);
  if (!server) return;

  const sessionId = stringOrNull(input.session_id);
  const [endpoint, body] = kind === "prompt"
    ? ["/api/prompt", { text: stringOrNull(input.prompt) ?? "", sessionId }]
    : ["/api/agent-finished", { text: await responseFrom(input.transcript_path), sessionId }];

  await fetch(`http://127.0.0.1:${server.port}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function responseFrom(transcriptPath: unknown): Promise<string | null> {
  if (typeof transcriptPath !== "string") return null;
  try {
    return lastResponseText(await readFile(transcriptPath, "utf8"));
  } catch {
    return null;  // no transcript to read: the turn is still logged, without its text
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const kind = process.argv[process.argv.indexOf(HOOK_FLAG) + 1];
  if (kind !== "prompt" && kind !== "stop") throw new Error(`unknown hook "${kind}"`);
  const text = await readStdin();
  await runHook(kind, text.trim() === "" ? {} : (JSON.parse(text) as HookInput), process.env);
}

// Only run when executed as the hook, not when setup imports HOOK_FLAG.
if (process.argv.includes(HOOK_FLAG)) {
  main()
    .catch((error: unknown) => {
      // Shown only in Claude Code's verbose mode; exiting 0 keeps the agent going.
      process.stderr.write(`diffviz hook: ${error instanceof Error ? error.message : String(error)}\n`);
    })
    .finally(() => process.exit(0));
}
