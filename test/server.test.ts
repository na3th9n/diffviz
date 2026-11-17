import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listenOnOpenPort, startServer, type RunningServer } from "../src/server/server.ts";

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
