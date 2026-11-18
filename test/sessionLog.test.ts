import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphState } from "../src/shared/types.ts";
import { readLog, saveFinalGraph, SessionLog } from "../src/server/sessionLog.ts";
import { partDir } from "../src/server/versions.ts";
import { makeTempDir } from "./helpers/gitRepo.ts";

const BASE = "3f9c2a1";

describe("SessionLog", () => {
  it("numbers prompts and records which prompt each AI output followed", async () => {
    const root = makeTempDir("diffviz-log-");
    const log = new SessionLog(root);
    await log.startPart(BASE);
    expect(log.activity()).toEqual({ promptCount: 0, aiOutputAfterPrompt: null });

    await log.logPrompt("Add a date helper", "s1");
    await log.logAiOutput("0001.json");
    await log.logResponse("Done.", "s1");
    await log.logPrompt("Use it in the header", "s1");

    expect(log.activity()).toEqual({ promptCount: 2, aiOutputAfterPrompt: 1 });
    expect((await readLog(root, BASE)).map((e) => e.type)).toEqual(["prompt", "aiOutput", "response", "prompt"]);
    expect(await readLog(root, BASE)).toMatchObject([
      { type: "prompt", prompt: 1, sessionId: "s1", text: "Add a date helper" },
      { type: "aiOutput", afterPrompt: 1, version: "0001.json" },
      { type: "response", afterPrompt: 1, text: "Done." },
      { type: "prompt", prompt: 2 },
    ]);
  });

  it("picks the counts back up from the file after a restart", async () => {
    const root = makeTempDir("diffviz-log-");
    const first = new SessionLog(root);
    await first.startPart(BASE);
    await first.logPrompt("one", null);
    await first.logAiOutput("0001.json");

    const restarted = new SessionLog(root);
    await restarted.startPart(BASE);
    expect(restarted.activity()).toEqual({ promptCount: 1, aiOutputAfterPrompt: 1 });
  });

  it("starts each session part from zero, in its own folder", async () => {
    const root = makeTempDir("diffviz-log-");
    const log = new SessionLog(root);
    await log.startPart(BASE);
    await log.logPrompt("one", null);
    await log.startPart("b7e01d4");
    expect(log.activity()).toEqual({ promptCount: 0, aiOutputAfterPrompt: null });
    expect(await readLog(root, "b7e01d4")).toEqual([]);
  });

  it("skips a line cut off by a crash", async () => {
    const root = makeTempDir("diffviz-log-");
    const log = new SessionLog(root);
    await log.startPart(BASE);
    await log.logPrompt("one", null);
    writeFileSync(path.join(partDir(root, BASE), "log.jsonl"), readFileSync(path.join(partDir(root, BASE), "log.jsonl"), "utf8") + '{"type":"pro');
    expect(await readLog(root, BASE)).toHaveLength(1);
  });
});

describe("saveFinalGraph", () => {
  it("saves the graph in its session part's folder with the commit that ended it", async () => {
    const root = makeTempDir("diffviz-log-");
    const graph: GraphState = {
      sessionPart: 1, baseCommit: BASE, isClean: false, errors: [], nodes: [], edges: [], agentOutput: null,
    };
    const file = await saveFinalGraph(root, graph, "b7e01d4");
    expect(file).toBe(path.join(partDir(root, BASE), "final.json"));
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ endCommit: "b7e01d4", graph });
  });
});

describe("SessionLog ordering", () => {
  it("counts a prompt before a response logged at the same moment", async () => {
    const root = makeTempDir("diffviz-log-");
    const log = new SessionLog(root);
    await log.startPart(BASE);
    await log.logPrompt("one", null);
    // Not awaited one by one: both hooks arrive together.
    await Promise.all([log.logPrompt("two", null), log.logResponse("answer", null)]);
    expect(await readLog(root, BASE)).toMatchObject([
      { type: "prompt", prompt: 1 },
      { type: "prompt", prompt: 2 },
      { type: "response", afterPrompt: 2 },
    ]);
  });
});
