// Reads Server-Sent Events from a fetch response, one message at a time.
export type SseReader = {
  next: (timeoutMs?: number) => Promise<{ event: string; data: unknown }>;
  close: () => Promise<void>;
};

export async function openSse(url: string): Promise<SseReader> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok || !response.body) throw new Error(`SSE request failed: HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error(`Not an event stream: ${response.headers.get("content-type")}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  async function next(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    // A message ends with a blank line.
    while (!buffer.includes("\n\n")) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Timed out waiting for an SSE message");
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out waiting for an SSE message")), remaining),
        ),
      ]);
      if (chunk.done) throw new Error("SSE stream ended");
      buffer += chunk.value;
    }
    const end = buffer.indexOf("\n\n");
    const raw = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);

    let event = "message";
    let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice("event: ".length);
      if (line.startsWith("data: ")) data += line.slice("data: ".length);
    }
    return { event, data: JSON.parse(data) as unknown };
  }

  return {
    next,
    close: async () => {
      controller.abort();
      await reader.cancel().catch(() => {
        // Already aborted above; cancelling a closed stream rejects, which is expected here.
      });
    },
  };
}
