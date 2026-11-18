# Recorded transcripts

Hand-written in the shape of a Claude Code session transcript (JSON Lines, one
entry per line), for the tests of `src/server/transcript.ts`. The format belongs
to Claude Code and isn't a public contract, which is why the parser skips
anything it doesn't recognise.

`two-turns.jsonl`: two prompts. The second turn has text, a tool call, a tool
result (stored as a "user" entry), and more text after it; there's also a
non-message entry and a line cut off mid-write.
