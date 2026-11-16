import type { ProjectInfo } from "../shared/types.ts";

export async function fetchProjectInfo(): Promise<ProjectInfo> {
  const response = await fetch("/api/project");
  if (!response.ok) {
    throw new Error(`Could not load project info (HTTP ${response.status})`);
  }
  return (await response.json()) as ProjectInfo;
}
