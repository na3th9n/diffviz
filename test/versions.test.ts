import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { partDir, saveVersion } from "../src/server/versions.ts";
import { makeTempDir } from "./helpers/gitRepo.ts";

const BASE = "3f9c2a1";

function versionsIn(root: string): string[] {
  return readdirSync(path.join(partDir(root, BASE), "versions")).sort();
}

describe("saveVersion", () => {
  it("numbers versions in the order they are saved, under the base commit's folder", async () => {
    const root = makeTempDir("diffviz-versions-");
    const first = await saveVersion(root, BASE, "one");
    await saveVersion(root, BASE, "two");

    expect(first).toBe("0001.json");
    expect(versionsIn(root)).toEqual(["0001.json", "0002.json"]);
    expect(readFileSync(path.join(partDir(root, BASE), "versions", "0002.json"), "utf8")).toBe("two");
  });

  it("skips a version identical to the latest one", async () => {
    const root = makeTempDir("diffviz-versions-");
    await saveVersion(root, BASE, "one");
    expect(await saveVersion(root, BASE, "one")).toBeNull();
    expect(versionsIn(root)).toEqual(["0001.json"]);
  });

  it("saves a repeat of an older version, since it is a new step in the history", async () => {
    const root = makeTempDir("diffviz-versions-");
    await saveVersion(root, BASE, "one");
    await saveVersion(root, BASE, "two");
    await saveVersion(root, BASE, "one");
    expect(versionsIn(root)).toEqual(["0001.json", "0002.json", "0003.json"]);
  });

  it("keeps each session part's versions in its own folder", async () => {
    const root = makeTempDir("diffviz-versions-");
    await saveVersion(root, BASE, "one");
    await saveVersion(root, "b7e01d4", "one");
    expect(versionsIn(root)).toEqual(["0001.json"]);
    expect(readdirSync(path.join(partDir(root, "b7e01d4"), "versions"))).toEqual(["0001.json"]);
  });
});
