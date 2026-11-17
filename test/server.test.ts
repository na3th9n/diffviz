import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listenOnOpenPort, startServer, type RunningServer } from "../src/server/server.ts";
import { createRepo } from "./helpers/gitRepo.ts";
import { openSse } from "./helpers/sse.ts";

// A fake project folder and a fake built UI, so the test does not need `npm run build`.
function makeFixture() {
  const base = mkdtempSync(path.join(os.tmpdir(), "diffviz-server-"));
  const projectRoot = path.join(base, "job-tracker");
  const webDir = path.join(base, "web");
  mkdirSync(projectRoot);
  mkdirSync(webDir);
  writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>diffviz test</title>");
  return { projectRoot, webDir, base };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function start(options: Parameters<typeof startServer>[0]): Promise<RunningServer> {
  const server = await startServer(options);
  cleanups.push(server.close);
  return server;
}

describe("startServer in production mode", () => {
  it("serves the project info for the folder it was started in", async () => {
    const { projectRoot, webDir } = makeFixture();
    const server = await start({ projectRoot, webDir, mode: "production", port: 4390 });

    const response = await fetch(`${server.url}/api/project`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { name: string }).name).toBe("job-tracker");
  });

  it("serves the built UI at /", async () => {
    const { projectRoot, webDir } = makeFixture();
    const server = await start({ projectRoot, webDir, mode: "production", port: 4390 });

    const response = await fetch(`${server.url}/`);
    expect(await response.text()).toContain("diffviz test");
  });

  it("fails with a clear message when the UI has not been built", async () => {
    const { projectRoot, base } = makeFixture();
    const emptyWebDir = path.join(base, "not-built");
    await expect(
      startServer({ projectRoot, webDir: emptyWebDir, mode: "production", port: 4390 }),
    ).rejects.toThrow(/npm run build/);
  });
});

describe("GET /api/events", () => {
  // The fake UI folder is reused; only the project root matters here.
  const { webDir } = makeFixture();

  it("sends the current state as soon as a browser connects", async () => {
    const repo = createRepo({ "a.ts": "a" });
    const server = await start({ projectRoot: repo.root, webDir, mode: "production", port: 4390 });

    const events = await openSse(`${server.url}/api/events`);
    cleanups.push(events.close);
    const first = await events.next();

    expect(first.event).toBe("state");
    expect(first.data).toMatchObject({ repo: "ready", graph: { sessionPart: 1, isClean: true, errors: [], nodes: [] } });
  });

  it("pushes a new graph when a file changes, and again after a commit", async () => {
    const repo = createRepo({ "a.ts": "export const a = 1;", "b.ts": "export const b = 1;" });
    const server = await start({ projectRoot: repo.root, webDir, mode: "production", port: 4390 });
    const events = await openSse(`${server.url}/api/events`);
    cleanups.push(events.close);
    await events.next();  // initial clean state

    repo.write("a.ts", 'import { b } from "./b";\nexport const a = b;');
    expect((await events.next()).data).toMatchObject({
      repo: "ready",
      graph: {
        isClean: false,
        nodes: [
          { id: "a.ts", status: "changed" },
          { id: "b.ts", status: "unchangedImport" },
        ],
        edges: [{ id: "a.ts->b.ts", source: "a.ts", target: "b.ts" }],
      },
    });

    const newHead = repo.commitAll();
    // A commit can arrive as more than one burst of events; wait for the clean one.
    type Graph = { isClean: boolean; baseCommit: string; sessionPart: number };
    let graph = ((await events.next()).data as { graph: Graph }).graph;
    while (!graph.isClean) graph = ((await events.next()).data as { graph: Graph }).graph;
    expect(graph.baseCommit).toBe(newHead);
    expect(graph.sessionPart).toBe(2);
  });

  it("reports a folder that is not a git repository", async () => {
    const { projectRoot } = makeFixture();
    const server = await start({ projectRoot, webDir, mode: "production", port: 4390 });
    const events = await openSse(`${server.url}/api/events`);
    cleanups.push(events.close);

    expect((await events.next()).data).toEqual({ repo: "notGitRepo", graph: null });
  });
});

describe("listenOnOpenPort", () => {
  it("moves to the next port when the preferred one is taken", async () => {
    const blocker = http.createServer();
    const preferred = await listenOnOpenPort(blocker, 4380);
    cleanups.push(() => new Promise((resolve) => blocker.close(() => resolve())));

    const server = http.createServer();
    const port = await listenOnOpenPort(server, preferred);
    cleanups.push(() => new Promise((resolve) => server.close(() => resolve())));

    expect(port).toBeGreaterThan(preferred);
  });

  it("gives up after the allowed number of attempts", async () => {
    const blocker = http.createServer();
    const taken = await listenOnOpenPort(blocker, 4370);
    cleanups.push(() => new Promise((resolve) => blocker.close(() => resolve())));

    const server = http.createServer();
    await expect(listenOnOpenPort(server, taken, 1)).rejects.toThrow(/No free port/);
  });
});
