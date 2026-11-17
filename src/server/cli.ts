#!/usr/bin/env node
import type { GitStatus } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { openBrowser } from "./browser.ts";
import { assertDirectory, getProjectInfo } from "./project.ts";
import { startServer } from "./server.ts";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.cwd());
  assertDirectory(options.root);

  const server = await startServer({
    projectRoot: options.root,
    mode: options.dev ? "dev" : "production",
    port: options.port,
  });

  const project = getProjectInfo(options.root);
  console.log(`diffviz is watching ${project.displayPath}`);
  console.log(`Open ${server.url}${options.dev ? " (dev mode)" : ""}`);

  const warning = gitWarning(server.getGitStatus());
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

// The same problems are shown in the UI; printing them here too means they are
// seen even if the browser does not open.
function gitWarning(status: GitStatus | null): string | null {
  if (status === null) return null;
  switch (status.kind) {
    case "notGitRepo":
      return "this folder is not a git repository, so diffviz can't build a graph. Run `git init` and make a first commit.";
    case "noCommits":
      return "this repository has no commits yet. Make a first commit so diffviz has something to compare against.";
    case "ready":
      return status.errors.find((error) => error.code === "dirtyAtLaunch")?.message ?? null;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `diffviz: ${error.message}` : error);
  process.exit(1);
});
