import { realpathSync } from "node:fs";
import path from "node:path";
import type { AgentOutput } from "../shared/types.ts";

// Rewrites a path the agent wrote into the form GraphNode ids use: relative to
// the project root, forward slashes, no leading "./" or "/", with "." and ".."
// segments resolved. For example "./src\\App.tsx" and "src/ui/../App.tsx" both
// become "src/App.tsx".
//
// This never rejects a path. One that still doesn't match a node (a typo, or a
// file outside the project like "../other/x.ts") is dropped later by the cross-check.
export function normalizeAgentPath(raw: string, projectRoot: string): string {
  const trimmed = raw.trim();
  const relative = relativeIfInsideProject(trimmed, projectRoot) ?? trimmed;
  const slashes = relative.replaceAll("\\", "/").replace(/^\/+/, "");
  // A file path never needs a trailing slash; dropping it also turns "./" into ".".
  const normalized = path.posix.normalize(slashes).replace(/\/+$/, "");
  return normalized === "." ? "" : normalized;
}

// Applies normalizeAgentPath to every path in the output.
export function normalizeAgentOutput(output: AgentOutput, projectRoot: string): AgentOutput {
  const fix = (p: string) => normalizeAgentPath(p, projectRoot);
  return {
    ...output,
    files: output.files.map((note) => ({ ...note, path: fix(note.path) })),
    layers: output.layers.map((layer) => ({ ...layer, paths: layer.paths.map(fix) })),
    relationships: output.relationships.map((r) => ({ ...r, source: fix(r.source), target: fix(r.target) })),
  };
}

// An agent sometimes writes absolute paths. One inside the project is turned
// into a relative path. The root is also tried as its real path, because on
// macOS a temp folder like /var/... is really /private/var/....
function relativeIfInsideProject(candidate: string, projectRoot: string): string | null {
  if (!path.isAbsolute(candidate)) return null;
  for (const root of new Set([projectRoot, realPathOrSelf(projectRoot)])) {
    const relative = path.relative(root, candidate);
    const outside = relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative);
    if (!outside) return relative;
  }
  return null;
}

function realPathOrSelf(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;  // a missing root just means there is no second form to try
  }
}
