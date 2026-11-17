import { useEffect, useState } from "react";
import type { AppState } from "../shared/types.ts";

// Must match STATE_EVENT in src/server/events.ts.
const STATE_EVENT = "state";

export type Connection = "connecting" | "open" | "lost";

// Subscribes to the server's live state over Server-Sent Events.
// EventSource reconnects by itself if the server restarts; while it is
// down, `connection` is "lost" and the last known state stays on screen.
export function useAppState(): { state: AppState | null; connection: Connection } {
  const [state, setState] = useState<AppState | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("open", () => setConnection("open"));
    source.addEventListener("error", () => setConnection("lost"));
    source.addEventListener(STATE_EVENT, (event) => {
      try {
        setState(JSON.parse(event.data) as AppState);
      } catch (error) {
        console.error("diffviz: could not read the state sent by the server:", error);
      }
    });
    return () => source.close();
  }, []);

  return { state, connection };
}
