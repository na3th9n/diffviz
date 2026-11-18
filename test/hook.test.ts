import { execFileSync } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { writeServerInfo } from "../src/server/appFiles.ts";
import { runHook } from "../src/server/hook.ts";
import { makeTempDir } from "./helpers/gitRepo.ts";

type Received = { url: string | undefined; contentType: string | undefined; body: unknown };

// A stand-in for the App's server that records what the hook sends.
async function fakeApp(): Promise<{ port: number; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      received.push({ url: req.url, contentType: req.headers["content-type"], body: JSON.parse(text) });
      res.statusCode = 202;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { port, received, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

const transcriptPath = fileURLToPath(new URL("../fixtures/transcripts/two-turns.jsonl", import.meta.url));
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
});

describe("runHook", () => {
  it("forwards a prompt to the running App", async () => {
    const app = await fakeApp();
    closers.push(app.close);
    const root = makeTempDir("diffviz-hook-");
    await writeServerInfo(root, { port: app.port, pid: 1 });

    await runHook("prompt", { prompt: "Add a date helper", session_id: "s1" }, { CLAUDE_PROJECT_DIR: root });
    expect(app.received).toEqual([
      { url: "/api/prompt", contentType: "application/json", body: { text: "Add a date helper", sessionId: "s1" } },
    ]);
  });

  it("sends the agent's last response, read from the transcript, when it stops", async () => {
    const app = await fakeApp();
    closers.push(app.close);
    const root = makeTempDir("diffviz-hook-");
    await writeServerInfo(root, { port: app.port, pid: 1 });

    await runHook("stop", { transcript_path: transcriptPath, cwd: root }, {});
    expect(app.received[0]?.url).toBe("/api/agent-finished");
    expect(app.received[0]?.body).toMatchObject({ text: expect.stringContaining("The header now shows today's date."), sessionId: null });
  });

  it("still reports the turn when the transcript can't be read", async () => {
    const app = await fakeApp();
    closers.push(app.close);
    const root = makeTempDir("diffviz-hook-");
    await writeServerInfo(root, { port: app.port, pid: 1 });

    await runHook("stop", { transcript_path: "/no/such/transcript.jsonl" }, { CLAUDE_PROJECT_DIR: root });
    expect(app.received[0]?.body).toEqual({ text: null, sessionId: null });
  });

  it("does nothing when the App isn't running in the project", async () => {
    await expect(runHook("prompt", { prompt: "hi" }, { CLAUDE_PROJECT_DIR: makeTempDir("diffviz-hook-") })).resolves.toBeUndefined();
  });
});

describe("the hook script", () => {
  const script = fileURLToPath(new URL("../src/server/hook.ts", import.meta.url));

  it("always exits 0, even with broken input, so it never blocks the agent", () => {
    const run = (input: string, kind: string) =>
      execFileSync(process.execPath, [script, "--diffviz-hook", kind], {
        input,
        env: { ...process.env, CLAUDE_PROJECT_DIR: makeTempDir("diffviz-hook-") },
        stdio: ["pipe", "pipe", "pipe"],
      });
    // execFileSync throws on a non-zero exit, so returning at all is the check.
    expect(() => run("{ not json", "prompt")).not.toThrow();
    expect(() => run("{}", "nonsense")).not.toThrow();
    expect(() => run('{"prompt":"hi"}', "prompt")).not.toThrow();
  });
});
