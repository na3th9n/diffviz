import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lastResponseText } from "../src/server/transcript.ts";

const transcript = readFileSync(new URL("../fixtures/transcripts/two-turns.jsonl", import.meta.url), "utf8");

describe("lastResponseText", () => {
  it("joins the text the agent wrote in its last turn, across tool calls", () => {
    expect(lastResponseText(transcript)).toBe(
      "I'll update App.tsx.\n\nThe header now shows today's date.\n\nThe graph of these changes is in diffviz.",
    );
  });

  it("does not treat a tool result as the start of a new turn", () => {
    expect(lastResponseText(transcript)).toContain("I'll update App.tsx.");
  });

  it("returns null when the last turn has no text yet", () => {
    const prompted = transcript + '{"type":"user","message":{"role":"user","content":"And add tests"}}\n';
    expect(lastResponseText(prompted)).toBeNull();
  });

  it("returns null for an empty or unreadable transcript", () => {
    expect(lastResponseText("")).toBeNull();
    expect(lastResponseText("not json\n[1,2]\n")).toBeNull();
  });
});
