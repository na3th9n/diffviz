import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentOutput, StatusError } from "../shared/types.ts";
import { AGENT_OUTPUT_FILE, parseAgentOutput } from "./agentOutput.ts";
import { normalizeAgentOutput } from "./agentPaths.ts";
import { APP_DIR } from "./appFiles.ts";
import { saveVersion } from "./versions.ts";

// Remembers what the agent has written to current.json during the current
// session part, and decides the two AI errors. It never touches the graph:
// ProjectState cross-checks `output()` against each new graph.
export class AgentOutputTracker {
  private readonly root: string;
  private baseCommit: string | null = null;

  // The text of current.json when it was last read, or null if it didn't exist.
  // A refresh only re-parses the file when this changes.
  private lastText: string | null = null;
  // The last valid output, paths normalized. Kept when a newer one is invalid
  // or the file is deleted, so the AI can never empty the labels.
  private lastValid: AgentOutput | null = null;
  private invalid: StatusError | null = null;
  private missing: StatusError | null = null;

  // For aiOutputMissing: the code's fingerprint when the agent last finished
  // (or when the session part started), and whether current.json was written since.
  private fingerprintAtFinish: string | null = null;
  private writtenSinceFinish = false;

  constructor(root: string) {
    this.root = root;
  }

  // Reads current.json and takes in a new version if there is one. Called on
  // every refresh. `fingerprint` is only called when a session part starts.
  async update(baseCommit: string, fingerprint: () => Promise<string>): Promise<void> {
    if (baseCommit !== this.baseCommit) {
      // A new session part (or the first read since launch) starts with no
      // labels and no errors. `lastText` is kept on purpose: the current.json
      // left over from the part that was just committed is not applied to the
      // new one. The agent's next rewrite will be.
      this.baseCommit = baseCommit;
      this.lastValid = null;
      this.invalid = null;
      this.missing = null;
      this.writtenSinceFinish = false;
      this.fingerprintAtFinish = await fingerprint();
    }

    const read = await this.readCurrent();
    if (read.kind === "unreadable") {
      this.invalid = { code: "aiOutputInvalid", message: `current.json could not be read: ${read.reason}` };
      this.lastText = null;  // so the file is taken in again once it can be read
      return;
    }
    // A deleted current.json keeps the last labels; there is nothing new to take in.
    const text = read.kind === "missing" ? null : read.text;
    if (text === this.lastText) return;
    this.lastText = text;
    if (text === null) return;

    // The agent did write: whatever happens next, the output is not "missing".
    this.writtenSinceFinish = true;
    this.missing = null;

    const result = parseAgentOutput(text);
    if (!result.ok) {
      this.invalid = {
        code: "aiOutputInvalid",
        message: `current.json is invalid, so the last valid labels are kept: ${result.message}`,
      };
      return;
    }
    this.invalid = null;
    this.lastValid = normalizeAgentOutput(result.output, this.root);
    await this.saveHistory(baseCommit, text);
  }

  // Called when the agent finishes a response (the hook in Part 6). If the
  // code changed during the turn but current.json was not rewritten, the
  // labels describe an older version of the code.
  finishTurn(fingerprint: string): void {
    if (this.baseCommit === null) return;  // no session part has started yet
    const codeChanged = fingerprint !== this.fingerprintAtFinish;
    if (codeChanged && !this.writtenSinceFinish) {
      this.missing = {
        code: "aiOutputMissing",
        message: "The agent finished and the code changed, but current.json was not updated. The labels may be out of date.",
      };
    }
    this.fingerprintAtFinish = fingerprint;
    this.writtenSinceFinish = false;
  }

  // The last valid output, before cross-checking against the graph.
  output(): AgentOutput | null {
    return this.lastValid;
  }

  errors(): StatusError[] {
    return [this.missing, this.invalid].filter((error): error is StatusError => error !== null);
  }

  private async readCurrent(): Promise<
    { kind: "text"; text: string } | { kind: "missing" } | { kind: "unreadable"; reason: string }
  > {
    try {
      return { kind: "text", text: await readFile(path.join(this.root, APP_DIR, AGENT_OUTPUT_FILE), "utf8") };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return { kind: "missing" };
      // Anything else (e.g. current.json is a folder) is shown as an error
      // instead of failing the refresh, so the graph still updates.
      return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  // Failing to save history must not stop the labels from showing, so the
  // error is logged rather than thrown.
  private async saveHistory(baseCommit: string, text: string): Promise<void> {
    try {
      await saveVersion(this.root, baseCommit, text);
    } catch (error) {
      console.error("diffviz: could not save this version of current.json:", error);
    }
  }
}
