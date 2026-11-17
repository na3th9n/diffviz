import type { Request, Response } from "express";
import type { GitStatus } from "../shared/types.ts";
import type { GitTracker } from "./gitTracker.ts";

// Name of the Server-Sent Events message that carries a GitStatus.
export const GIT_STATUS_EVENT = "git-status";

// Express handler for GET /api/events. Keeps the response open and writes
// the latest GitStatus to it on connect and after every refresh.
export function gitStatusStream(tracker: GitTracker) {
  return (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const current = tracker.getStatus();
    if (current) sendEvent(res, GIT_STATUS_EVENT, current);

    const unsubscribe = tracker.onUpdate((status) => sendEvent(res, GIT_STATUS_EVENT, status));
    req.on("close", unsubscribe);
  };
}

// SSE format: an "event:" line, a "data:" line, then a blank line ends the message.
// JSON.stringify never outputs a raw newline, so the data fits on one line.
export function sendEvent(res: Response, event: string, data: GitStatus): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
