import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_DIR } from "./appFiles.ts";
import { AGENT_OUTPUT_FILE, SCHEMA_VERSION } from "./agentOutput.ts";
import { HOOK_FLAG, type HookKind } from "./hook.ts";

// Setup runs on every launch and only changes what is out of date, so a newer
// version of the App can update its instructions and hooks in place.

export const SETTINGS_FILE = path.join(".claude", "settings.local.json");
const CLAUDE_MD = "CLAUDE.md";
const BLOCK_START = "<!-- diffviz:start (managed by diffviz; edits here are replaced on the next launch) -->";
const BLOCK_END = "<!-- diffviz:end -->";

// The script Claude Code runs for each hook: the .ts file when the App runs
// from source in dev, the compiled .js file once built.
const HOOK_SCRIPT = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "./hook.ts" : "./hook.js", import.meta.url));

export type SetupChange = { file: string; change: "created" | "updated" };

export type SetupResult = {
  changes: SetupChange[];
  warnings: string[];
};

// Adds the CLAUDE.md instructions and the Claude Code hooks, and keeps the
// App's files out of git. `gitDir` is null outside a git repository, where
// setup does nothing: the App can't build a graph there anyway, and it must not
// write a CLAUDE.md into whatever folder it was started in by mistake.
export async function runSetup(projectRoot: string, gitDir: string | null): Promise<SetupResult> {
  const result: SetupResult = { changes: [], warnings: [] };
  if (gitDir === null) return result;

  const instructions = await ensureInstructions(projectRoot);
  if (instructions) result.changes.push({ file: CLAUDE_MD, change: instructions });

  const hooks = await ensureHooks(projectRoot, hookCommand);
  if (hooks.kind === "changed") result.changes.push({ file: SETTINGS_FILE, change: hooks.change });
  if (hooks.kind === "skipped") result.warnings.push(hooks.reason);

  await ensureGitExcludes(gitDir);
  return result;
}

export function hookCommand(kind: HookKind): string {
  return `node "${HOOK_SCRIPT}" ${HOOK_FLAG} ${kind}`;
}

// ---- CLAUDE.md ----

// Appends the instructions block to CLAUDE.md (creating the file if needed),
// or replaces an existing block if its text is out of date.
export async function ensureInstructions(projectRoot: string): Promise<"created" | "updated" | null> {
  const file = path.join(projectRoot, CLAUDE_MD);
  const block = `${BLOCK_START}\n${INSTRUCTIONS.trim()}\n${BLOCK_END}`;
  const existing = await readIfExists(file);

  if (existing === null) {
    await writeFile(file, block + "\n");
    return "created";
  }

  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END, start);
  if (start === -1 || end === -1) {
    const separator = existing === "" || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    await writeFile(file, existing + separator + block + "\n");
    return "updated";
  }

  const updated = existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
  if (updated === existing) return null;
  await writeFile(file, updated);
  return "updated";
}

// What the agent is told to do after every response. The shape below is the
// AgentOutput type in docs/SPEC.md; it must change together with the Zod schema.
const INSTRUCTIONS = `
## diffviz: describe your changes after every response

This project is open in diffviz, which graphs the changes made since the last
commit. It builds the graph from git; you label it. After **every** response,
rewrite \`${APP_DIR}/${AGENT_OUTPUT_FILE}\` (create the folder if needed), even if this
response changed no code.

1. Read the existing \`${APP_DIR}/${AGENT_OUTPUT_FILE}\` first, if there is one. It describes
   the work since the last commit. If it is missing, this is a new session part:
   start a new one.
2. Describe **all** changes since the last commit, not just this response:
   update the summary, add new files, and remove files that no longer differ.
3. Reuse existing layer ids. Names and descriptions can change.
4. Write exactly this JSON shape (schemaVersion ${SCHEMA_VERSION}):

\`\`\`ts
type AgentOutput = {
  schemaVersion: ${SCHEMA_VERSION},
  summary: string,        // what this session part changed so far; a few short paragraphs, separated by blank lines
  files: { path: string, description: string }[],   // each changed file: what changed and why
  layers: { id: string, name: string, description: string, paths: string[] }[],  // groups such as "UI", "API", "Database"
  relationships: { source: string, target: string, label: string, description: string }[],  // labels for imports
}
\`\`\`

Rules:
- Paths are relative to the project root, with forward slashes and the file
  extension, e.g. \`src/components/Button.tsx\`.
- Only describe files that changed since the last commit (added, modified,
  deleted or renamed). Unchanged files don't get a description.
- Put each file in at most one layer. Files don't have to be in a layer.
- A relationship labels a real import: \`source\` is the file that imports
  \`target\`. Use a short \`label\` such as "renders" or "fetches from".
  Anything else is discarded.
- End every response by reminding the user that the graph of these changes is
  in diffviz, and that they should commit if this part of the work is complete.
`;

// ---- Claude Code hooks ----

type HookEntry = { type?: unknown; command?: unknown; [key: string]: unknown };
type HookGroup = { matcher?: unknown; hooks?: unknown; [key: string]: unknown };
type Settings = { hooks?: Record<string, unknown>; [key: string]: unknown };

const HOOK_EVENTS: Array<[event: string, kind: HookKind]> = [
  ["UserPromptSubmit", "prompt"],
  ["Stop", "stop"],
];

// How long Claude Code waits for a hook, in seconds. The hook itself gives up
// after 2 s, so this is only a backstop.
const HOOK_TIMEOUT_S = 10;

export type HooksResult =
  | { kind: "changed"; change: "created" | "updated" }
  | { kind: "unchanged" }
  | { kind: "skipped"; reason: string };

// Adds the diffviz hooks to .claude/settings.local.json, the settings file for
// this machine only (the command holds a path on this machine). Hooks and
// settings that are not diffviz's are kept as they are.
export async function ensureHooks(projectRoot: string, command: (kind: HookKind) => string): Promise<HooksResult> {
  const file = path.join(projectRoot, SETTINGS_FILE);
  const existing = await readIfExists(file);

  let settings: Settings = {};
  if (existing !== null && existing.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(existing);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not a JSON object");
      settings = parsed as Settings;
    } catch (error) {
      // Never overwrite a settings file we can't read: it may hold the user's own settings.
      const reason = error instanceof Error ? error.message : String(error);
      return { kind: "skipped", reason: `${SETTINGS_FILE} could not be read (${reason}), so the diffviz hooks were not added.` };
    }
  }

  const hooks: Record<string, unknown> = { ...(isObject(settings.hooks) ? settings.hooks : {}) };
  for (const [event, kind] of HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    const others = withoutDiffvizHooks(groups);
    hooks[event] = [...others, { hooks: [{ type: "command", command: command(kind), timeout: HOOK_TIMEOUT_S }] }];
  }

  const updated = JSON.stringify({ ...settings, hooks }, null, 2) + "\n";
  if (updated === existing) return { kind: "unchanged" };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, updated);
  return { kind: "changed", change: existing === null ? "created" : "updated" };
}

// Removes diffviz's own hook commands (found by HOOK_FLAG), dropping groups
// left empty, and keeps everything else untouched.
function withoutDiffvizHooks(groups: unknown[]): unknown[] {
  const kept: unknown[] = [];
  for (const group of groups) {
    if (!isObject(group) || !Array.isArray((group as HookGroup).hooks)) {
      kept.push(group);
      continue;
    }
    const entries = ((group as HookGroup).hooks as unknown[]).filter((entry) => !isDiffvizHook(entry));
    if (entries.length > 0) kept.push({ ...group, hooks: entries });
  }
  return kept;
}

function isDiffvizHook(entry: unknown): boolean {
  return isObject(entry) && typeof (entry as HookEntry).command === "string" && ((entry as HookEntry).command as string).includes(HOOK_FLAG);
}

// ---- git ----

// Keeps the App's files out of `git status` and out of commits, using the
// repository's own exclude list (.git/info/exclude) instead of .gitignore, so
// setup never adds a change to the project. "**/" makes the patterns match in
// a project that sits inside a larger repository too.
export const GIT_EXCLUDES = [`**/${APP_DIR}/`, "**/.claude/settings.local.json"];

export async function ensureGitExcludes(gitDir: string): Promise<void> {
  const file = path.join(gitDir, "info", "exclude");
  const existing = (await readIfExists(file)) ?? "";
  const lines = new Set(existing.split("\n").map((line) => line.trim()));
  const missing = GIT_EXCLUDES.filter((pattern) => !lines.has(pattern));
  if (missing.length === 0) return;
  await mkdir(path.dirname(file), { recursive: true });
  const prefix = existing === "" || existing.endsWith("\n") ? "" : "\n";
  await appendFile(file, `${prefix}# Added by diffviz\n${missing.join("\n")}\n`);
}

// ---- helpers ----

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
