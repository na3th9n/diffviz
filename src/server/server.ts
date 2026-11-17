import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { AppState } from "../shared/types.ts";
import { stateStream } from "./events.ts";
import { getGitDir } from "./git.ts";
import { getProjectInfo } from "./project.ts";
import { ProjectState } from "./projectState.ts";
import { watchProject } from "./watcher.ts";

export type ServerMode = "dev" | "production";

// The built UI sits next to the compiled server: dist/server/ and dist/web/.
const DEFAULT_WEB_DIR = fileURLToPath(new URL("../web", import.meta.url));
const VITE_CONFIG = fileURLToPath(new URL("../../vite.config.ts", import.meta.url));

// Only bind to this machine: the server can read the whole project folder.
const HOST = "127.0.0.1";

type AppOptions = {
  projectRoot: string;
  mode: ServerMode;
  httpServer: http.Server;  // Vite attaches its hot-reload socket to it in dev
  projectState: ProjectState;  // source of the state pushed over /api/events
  webDir?: string;          // built UI folder, overridable for tests
};

type CreatedApp = {
  app: express.Express;
  close: () => Promise<void>;
};

export async function createApp(options: AppOptions): Promise<CreatedApp> {
  const app = express();

  app.get("/api/project", (_req, res) => {
    res.json(getProjectInfo(options.projectRoot));
  });

  app.get("/api/events", stateStream(options.projectState));

  if (options.mode === "dev") {
    // Imported only in dev, so production installs do not need Vite.
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: VITE_CONFIG,
      appType: "spa",
      server: { middlewareMode: true, hmr: { server: options.httpServer } },
    });
    app.use(vite.middlewares);
    return { app, close: () => vite.close() };
  }

  const webDir = options.webDir ?? DEFAULT_WEB_DIR;
  if (!existsSync(path.join(webDir, "index.html"))) {
    throw new Error(`The UI has not been built (no index.html in ${webDir}). Run "npm run build".`);
  }
  app.use(express.static(webDir));
  return { app, close: async () => {} };
}

type StartOptions = {
  projectRoot: string;
  mode: ServerMode;
  port: number;
  webDir?: string;
};

export type RunningServer = {
  url: string;
  port: number;
  getState: () => AppState | null;
  close: () => Promise<void>;
};

export async function startServer(options: StartOptions): Promise<RunningServer> {
  // Build the state once before serving, so the first browser connection gets a real one.
  const projectState = new ProjectState(options.projectRoot);
  await projectState.refresh();

  const watcher = watchProject({
    root: options.projectRoot,
    gitDir: await getGitDir(options.projectRoot),
    onChange: () => {
      // A failed refresh keeps the last state on screen; the next change tries again.
      projectState.refresh().catch((error: unknown) => {
        console.error("diffviz: could not refresh the graph:", error);
      });
    },
  });

  const httpServer = http.createServer();
  const created = await createApp({ ...options, httpServer, projectState });
  httpServer.on("request", created.app);

  const port = await listenOnOpenPort(httpServer, options.port);
  await watcher.ready;
  return {
    url: `http://localhost:${port}`,
    port,
    getState: () => projectState.getState(),
    close: async () => {
      await watcher.close();
      await created.close();
      await closeHttpServer(httpServer);
    },
  };
}

// Tries `preferred`, then the next ports, so a second copy of the App
// (or anything else on 4300) does not stop it from starting.
export async function listenOnOpenPort(
  server: http.Server,
  preferred: number,
  maxAttempts = 10,
): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = preferred + attempt;
    try {
      await listen(server, port);
      return port;
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
    }
  }
  const last = preferred + maxAttempts - 1;
  throw new Error(`No free port between ${preferred} and ${last}. Pass another with --port.`);
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

function closeHttpServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Browsers keep connections open; without this, close() waits for them.
    server.closeAllConnections();
  });
}
