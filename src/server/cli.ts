#!/usr/bin/env node
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `diffviz: ${error.message}` : error);
  process.exit(1);
});
