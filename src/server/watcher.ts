import path from "node:path";
import { watch } from "chokidar";
import { APP_DIR } from "./git.ts";

export const DEBOUNCE_MS = 200;

type WatchOptions = {
  root: string;
  gitDir: string | null;  // the repo's .git folder, or null if the project is not a repo yet
  onChange: () => void;
  debounceMs?: number;
};

export type ProjectWatcher = {
  ready: Promise<void>;  // resolves once the initial scan is done and events are being reported
  close: () => Promise<void>;
};

// Watches the project's files and git's commit markers, and calls onChange
// once after each burst of events (an agent saving ten files triggers one refresh).
export function watchProject(options: WatchOptions): ProjectWatcher {
  const { root, gitDir, onChange, debounceMs = DEBOUNCE_MS } = options;

  // In a monorepo the .git folder sits above the project root, so watch it separately.
  const paths = gitDir && !isInside(root, gitDir) ? [root, gitDir] : [root];
  const watcher = watch(paths, {
    ignoreInitial: true,
    ignored: (filePath: string) => shouldIgnore(filePath, root, gitDir),
  });

  let timer: NodeJS.Timeout | undefined;
  watcher.on("all", () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  });
  watcher.on("error", (error) => {
    console.error("diffviz: file watcher error:", error);
  });

  const ready = new Promise<void>((resolve) => watcher.once("ready", () => resolve()));
  return {
    ready,
    close: async () => {
      clearTimeout(timer);
      await watcher.close();
    },
  };
}

// Decides which paths the watcher skips. Project files are watched, except
// node_modules (huge, never part of the diff) and the App's own folder. Inside
// .git, only the files that change on a commit are watched: everything else
// there changes constantly and would cause needless refreshes.
export function shouldIgnore(filePath: string, root: string, gitDir: string | null): boolean {
  if (gitDir && isInside(gitDir, filePath)) {
    return !isCommitMarker(segments(gitDir, filePath));
  }
  const parts = segments(root, filePath);
  if (parts.includes("node_modules")) return true;
  if (parts[0] === APP_DIR) return true;
  // Also covers a .git folder created after launch by `git init`.
  if (parts[0] === ".git") return !isCommitMarker(parts.slice(1));
  return false;
}

// HEAD says which branch is checked out; refs/ and packed-refs hold each
// branch's latest commit. One of them changes on every commit or checkout.
function isCommitMarker(partsInsideGitDir: string[]): boolean {
  const [first, ...rest] = partsInsideGitDir;
  if (first === undefined) return true;  // the .git folder itself, so the watcher can enter it
  if (first === "refs") return true;
  return rest.length === 0 && (first === "HEAD" || first === "packed-refs");
}

function segments(base: string, filePath: string): string[] {
  const relative = path.relative(base, filePath);
  return relative === "" ? [] : relative.split(path.sep);
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  const goesUp = relative === ".." || relative.startsWith(".." + path.sep);
  return !goesUp && !path.isAbsolute(relative);
}
