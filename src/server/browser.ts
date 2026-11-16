import { spawn } from "node:child_process";

// Opens `url` in the default browser using the OS's own command,
// so no extra dependency is needed.
export function openBrowser(url: string): void {
  const [command, args] = browserCommand(url);
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", (error) => {
    // Not fatal: the URL is already printed, so the user can open it by hand.
    console.warn(`Could not open the browser (${error.message}). Open ${url} manually.`);
  });
  child.unref();
}

function browserCommand(url: string): [string, string[]] {
  switch (process.platform) {
    case "darwin":
      return ["open", [url]];
    case "win32":
      // The empty "" is start's window title; without it the URL is taken as the title.
      return ["cmd", ["/c", "start", "", url]];
    default:
      return ["xdg-open", [url]];
  }
}
