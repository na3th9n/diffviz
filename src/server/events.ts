import type { Request, Response } from "express";
import type { AppState } from "../shared/types.ts";
import type { ProjectState } from "./projectState.ts";

// Name of the Server-Sent Events message that carries an AppState.
export const STATE_EVENT = "state";

// Express handler for GET /api/events. Keeps the response open and writes
// the latest AppState to it on connect and after every refresh.
export function stateStream(projectState: ProjectState) {
  return (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const current = projectState.getState();
    if (current) sendEvent(res, STATE_EVENT, current);

    const unsubscribe = projectState.onUpdate((state) => sendEvent(res, STATE_EVENT, state));
    req.on("close", unsubscribe);
  };
}

// SSE format: an "event:" line, a "data:" line, then a blank line ends the message.
// JSON.stringify never outputs a raw newline, so the data fits on one line.
export function sendEvent(res: Response, event: string, data: AppState): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
