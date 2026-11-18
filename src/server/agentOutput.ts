import { z } from "zod";
import type { AgentOutput } from "../shared/types.ts";

// The file the agent rewrites after every response, inside the App's folder.
export const AGENT_OUTPUT_FILE = "current.json";

// The only shape this version of the App reads. Changing AgentOutput means
// bumping this, updating the schema below, the fixtures and the parser together.
export const SCHEMA_VERSION = 1;

// How many validation problems the status bar lists before "and N more".
const MAX_ISSUES_SHOWN = 3;

const FileNoteSchema = z.object({
  path: z.string(),
  description: z.string(),
});

const LayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  paths: z.array(z.string()),
});

const RelationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string(),
  description: z.string(),
});

// Unknown extra fields are dropped rather than rejected: they do no harm, and
// rejecting them would throw away good labels over a harmless addition.
// `satisfies` makes the typecheck fail if this schema and the AgentOutput type drift apart.
export const AgentOutputSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION, {
    error: `schemaVersion must be ${SCHEMA_VERSION}`,
  }),
  summary: z.string(),
  files: z.array(FileNoteSchema),
  layers: z.array(LayerSchema),
  relationships: z.array(RelationshipSchema),
}) satisfies z.ZodType<AgentOutput>;

export type ParseResult =
  | { ok: true; output: AgentOutput }
  | { ok: false; message: string };  // why it was rejected, for the status bar

// Checks the text of current.json. Never throws: broken JSON and a wrong
// shape both come back as { ok: false } with a readable reason.
export function parseAgentOutput(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `not valid JSON (${reason})` };
  }

  const result = AgentOutputSchema.safeParse(json);
  if (!result.success) return { ok: false, message: formatIssues(result.error.issues) };
  return { ok: true, output: result.data };
}

type Issue = { path: PropertyKey[]; message: string };

// Turns Zod's issues into one short line, e.g.
// "files[2].path: Invalid input: expected string, received number; and 1 more".
export function formatIssues(issues: readonly Issue[]): string {
  const shown = issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
  const hidden = issues.length - shown.length;
  if (hidden > 0) shown.push(`and ${hidden} more`);
  return shown.join("; ");
}

// ["files", 2, "path"] -> "files[2].path". An empty path means the whole file.
function formatPath(issuePath: PropertyKey[]): string {
  if (issuePath.length === 0) return "(whole file)";
  let text = "";
  for (const key of issuePath) {
    if (typeof key === "number") text += `[${key}]`;
    else text += text === "" ? String(key) : `.${String(key)}`;
  }
  return text;
}
