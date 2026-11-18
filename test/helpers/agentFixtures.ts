import { readFileSync } from "node:fs";

// The text of a recorded current.json from fixtures/agent-output/.
export function agentFixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/agent-output/${name}`, import.meta.url), "utf8");
}
