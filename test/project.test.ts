import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertDirectory, getProjectInfo, toDisplayPath } from "../src/server/project.ts";

describe("getProjectInfo", () => {
  it("uses the folder name and shows the home directory as ~", () => {
    const info = getProjectInfo("/Users/sam/projects/job-tracker", "/Users/sam");
    expect(info).toEqual({ name: "job-tracker", displayPath: "~/projects/job-tracker" });
  });

  it("keeps the full path for folders outside the home directory", () => {
    const info = getProjectInfo("/opt/work/api", "/Users/sam");
    expect(info).toEqual({ name: "api", displayPath: "/opt/work/api" });
  });

  it("falls back to the path itself for the filesystem root", () => {
    expect(getProjectInfo("/", "/Users/sam").name).toBe("/");
  });
});

describe("toDisplayPath", () => {
  it("shows the home directory itself as ~", () => {
    expect(toDisplayPath("/Users/sam", "/Users/sam")).toBe("~");
  });

  it("does not treat a sibling folder that shares the prefix as inside home", () => {
    // "/Users/samantha" starts with "/Users/sam" as a string, but is not inside it.
    expect(toDisplayPath("/Users/samantha/app", "/Users/sam")).toBe("/Users/samantha/app");
  });
});

describe("assertDirectory", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "diffviz-project-"));

  it("accepts an existing folder", () => {
    expect(() => assertDirectory(tempDir)).not.toThrow();
  });

  it("rejects a missing path", () => {
    expect(() => assertDirectory(path.join(tempDir, "missing"))).toThrow(/not found/);
  });

  it("rejects a file", () => {
    const file = path.join(tempDir, "file.txt");
    writeFileSync(file, "hi");
    expect(() => assertDirectory(file)).toThrow(/not a folder/);
  });
});
