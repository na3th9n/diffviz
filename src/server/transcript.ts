// Claude Code writes each session to a JSON Lines transcript: one JSON object
// per line, for every user message, assistant message and tool result. The
// format is Claude Code's own and not a public contract, so everything here is
// defensive: anything unexpected is skipped, and the worst case is "no response
// text", never an error.

type TranscriptEntry = {
  type?: unknown;
  message?: { role?: unknown; content?: unknown };
};

// Returns the text the agent wrote in its last turn: every assistant text block
// after the user's last prompt, joined with blank lines. Tool calls and tool
// results are left out. Returns null when there is no such text.
export function lastResponseText(transcript: string): string | null {
  let texts: string[] = [];
  for (const line of transcript.split("\n")) {
    const entry = parseLine(line);
    if (!entry) continue;
    if (isUserPrompt(entry)) {
      texts = [];  // a new turn starts: only the last one counts
    } else if (entry.type === "assistant") {
      texts.push(...textBlocks(entry.message?.content));
    }
  }
  const joined = texts.map((text) => text.trim()).filter((text) => text !== "").join("\n\n");
  return joined === "" ? null : joined;
}

function parseLine(line: string): TranscriptEntry | null {
  if (line.trim() === "") return null;
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null ? (value as TranscriptEntry) : null;
  } catch {
    return null;  // a half-written last line, or a format change: skip it
  }
}

// A prompt the user typed, as opposed to a tool result, which the transcript
// also stores as a "user" message.
function isUserPrompt(entry: TranscriptEntry): boolean {
  if (entry.type !== "user") return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  return Array.isArray(content) && content.some((block) => isBlock(block) && block.type === "text");
}

function textBlocks(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.filter((block) => isBlock(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => (block as { text: string }).text);
}

function isBlock(value: unknown): value is { type?: unknown; text?: unknown } {
  return typeof value === "object" && value !== null;
}
