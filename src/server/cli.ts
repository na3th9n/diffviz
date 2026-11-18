#!/usr/bin/env node
import type { AppState } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { openBrowser } from "./browser.ts";
import { assertDirectory, getProjectInfo } from "./project.ts";
import { getGitDir } from "./git.ts";
import { startServer } from "./server.ts";
import { runSetup, type SetupResult } from "./setup.ts";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.cwd());
  assertDirectory(options.root);

  // Before the server starts, so its first look at the tree already includes
  // any CLAUDE.md change.
  const setup = await runSetup(options.root, await getGitDir(options.root));

  const server = await startServer({
    projectRoot: options.root,
    mode: options.dev ? "dev" : "production",
    port: options.port,
  });

  const project = getProjectInfo(options.root);
  console.log(`diffviz is watching ${project.displayPath}`);
  console.log(`Open ${server.url}${options.dev ? " (dev mode)" : ""}`);

  printSetup(setup);
  const warning = gitWarning(server.getState());
  if (warning) console.warn(`Warning: ${warning}`);

  if (options.open) openBrowser(server.url);

  const shutdown = () => {
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("Error while shutting down:", error);
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function printSetup(setup: SetupResult): void {
  for (const { file, change } of setup.changes) {
    if (file === "CLAUDE.md") {
      console.log(`${change === "created" ? "Created" : "Updated"} CLAUDE.md with instructions for Claude Code. Commit it before you start, so it isn't part of the graph.`);
    } else {
      console.log(`${change === "created" ? "Created" : "Updated"} ${file} with the hooks that tell diffviz about each prompt and response.`);
    }
  }
  for (const warning of setup.warnings) console.warn(`Warning: ${warning}`);
}

// The same problems are shown in the UI; printing them here too means they are
// seen even if the browser does not open.
function gitWarning(state: AppState | null): string | null {
  if (state === null) return null;
  switch (state.repo) {
    case "notGitRepo":
      return "this folder is not a git repository, so diffviz can't build a graph. Run `git init` and make a first commit.";
    case "noCommits":
      return "this repository has no commits yet. Make a first commit so diffviz has something to compare against.";
    case "ready":
      return state.graph?.errors.find((error) => error.code === "dirtyAtLaunch")?.message ?? null;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `diffviz: ${error.message}` : error);
  process.exit(1);
});
