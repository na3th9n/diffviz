import { useEffect, useState } from "react";
import type { GitStatus } from "../shared/types.ts";

// Must match GIT_STATUS_EVENT in src/server/events.ts.
const GIT_STATUS_EVENT = "git-status";

export type Connection = "connecting" | "open" | "lost";

// Subscribes to the server's live git status over Server-Sent Events.
// EventSource reconnects by itself if the server restarts; while it is
// down, `connection` is "lost" and the last known status stays on screen.
export function useGitStatus(): { status: GitStatus | null; connection: Connection } {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("open", () => setConnection("open"));
    source.addEventListener("error", () => setConnection("lost"));
    source.addEventListener(GIT_STATUS_EVENT, (event) => {
      try {
        setStatus(JSON.parse(event.data) as GitStatus);
      } catch (error) {
        console.error("diffviz: could not read git status from the server:", error);
      }
    });
    return () => source.close();
  }, []);

  return { status, connection };
}
