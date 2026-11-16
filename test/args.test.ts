import { describe, expect, it } from "vitest";
import { DEFAULT_PORT, parseArgs } from "../src/server/args.ts";

const cwd = "/Users/sam/projects/job-tracker";

describe("parseArgs", () => {
  it("defaults to the current folder, port 4300, opening the browser, production mode", () => {
    expect(parseArgs([], cwd)).toEqual({ root: cwd, port: DEFAULT_PORT, open: true, dev: false });
  });

  it("reads --port, --no-open and --dev", () => {
    const options = parseArgs(["--port", "5000", "--no-open", "--dev"], cwd);
    expect(options).toMatchObject({ port: 5000, open: false, dev: true });
  });

  it("resolves --root against the current folder in dev mode", () => {
    const options = parseArgs(["--dev", "--root", "../other"], cwd);
    expect(options.root).toBe("/Users/sam/projects/other");
  });

  it("rejects --root outside dev mode", () => {
    expect(() => parseArgs(["--root", "/tmp"], cwd)).toThrow(/only available with --dev/);
  });

  it.each(["0", "70000", "abc", "43.5"])("rejects the invalid port %s", (port) => {
    expect(() => parseArgs(["--port", port], cwd)).toThrow(/Invalid --port/);
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--verbose"], cwd)).toThrow();
  });
});
