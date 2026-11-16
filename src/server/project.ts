import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectInfo } from "../shared/types.ts";

export function getProjectInfo(root: string, homeDir: string = os.homedir()): ProjectInfo {
  return {
    // basename of "/" is "", so fall back to the root itself.
    name: path.basename(root) || root,
    displayPath: toDisplayPath(root, homeDir),
  };
}

// Shows paths inside the home directory as "~/...", like a shell prompt.
export function toDisplayPath(root: string, homeDir: string): string {
  const relative = path.relative(homeDir, root);
  if (relative === "") return "~";
  const isInsideHome = !relative.startsWith("..") && !path.isAbsolute(relative);
  if (!isInsideHome) return root;
  return "~/" + relative.split(path.sep).join("/");
}

// Throws a readable error if the project root is missing or is not a folder.
export function assertDirectory(root: string): void {
  let isDirectory: boolean;
  try {
    isDirectory = statSync(root).isDirectory();
  } catch (error) {
    throw new Error(`Project folder not found: ${root}`, { cause: error });
  }
  if (!isDirectory) throw new Error(`Project path is not a folder: ${root}`);
}
