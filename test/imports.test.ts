import { cpSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { resolveImports, toProjectPath } from "../src/server/imports.ts";
import { makeTempDir } from "./helpers/gitRepo.ts";

function copyFixture(name: string): string {
  const root = makeTempDir(`diffviz-imports-${name}-`);
  cpSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), root, { recursive: true });
  return root;
}

// Writes files into a fresh temp folder; returns the folder.
function makeProject(files: Record<string, string>): string {
  const root = makeTempDir("diffviz-imports-");
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe("resolveImports on the basic-app fixture", () => {
  const root = copyFixture("basic-app");
  const imports = resolveImports(root, [
    "src/App.tsx",
    "src/main.ts",
    "src/components/index.ts",
    "src/components/Button.tsx",
    "src/utils/lazy.ts",
  ]);

  it("resolves a path alias, a folder index, import type, JSON and a CSS module; skips npm packages", () => {
    expect(imports.get("src/App.tsx")).toEqual([
      "src/App.module.css",
      "src/components/index.ts",  // "@/components" → alias → folder index
      "src/config.json",
      "src/types.ts",             // import type
      // "react" is an npm package: no entry
    ]);
  });

  it("resolves an extensionless import and a side-effect CSS import", () => {
    expect(imports.get("src/main.ts")).toEqual(["src/App.tsx", "src/styles.css"]);
  });

  it("follows export … from", () => {
    expect(imports.get("src/components/index.ts")).toEqual(["src/components/Button.tsx"]);
  });

  it('maps a ".js" import to the ".ts" file', () => {
    expect(imports.get("src/components/Button.tsx")).toEqual(["src/utils/format.ts"]);
  });

  it("resolves a dynamic import with a fixed string", () => {
    expect(imports.get("src/utils/lazy.ts")).toEqual(["src/utils/format.ts"]);
  });
});

describe("resolveImports edge cases", () => {
  it("uses default settings when there is no tsconfig.json", () => {
    const root = makeProject({ "a.ts": 'import { b } from "./b";', "b.ts": "export const b = 1;" });
    expect(resolveImports(root, ["a.ts"]).get("a.ts")).toEqual(["b.ts"]);
  });

  it("uses the nearest tsconfig.json, following extends", () => {
    const root = makeProject({
      "tsconfig.base.json": JSON.stringify({ compilerOptions: { moduleResolution: "Bundler", module: "ESNext" } }),
      "apps/web/tsconfig.json": JSON.stringify({
        extends: "../../tsconfig.base.json",
        compilerOptions: { paths: { "~/*": ["./src/*"] } },
      }),
      "apps/web/src/a.ts": 'import { b } from "~/b";',
      "apps/web/src/b.ts": "export const b = 1;",
    });
    expect(resolveImports(root, ["apps/web/src/a.ts"]).get("apps/web/src/a.ts")).toEqual(["apps/web/src/b.ts"]);
  });

  it("still resolves relative imports when the tsconfig.json is broken", () => {
    const root = makeProject({ "tsconfig.json": "{ this is not json", "a.ts": 'import "./b";', "b.ts": "" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveImports(root, ["a.ts"]).get("a.ts")).toEqual(["b.ts"]);
    warn.mockRestore();
  });

  it("resolves a workspace package through its node_modules link to the real source file", () => {
    const root = makeProject({
      "tsconfig.json": JSON.stringify({ compilerOptions: { moduleResolution: "Bundler", module: "ESNext" } }),
      "packages/shared/package.json": JSON.stringify({ name: "@acme/shared", exports: { ".": "./src/index.ts" } }),
      "packages/shared/src/index.ts": "export const shared = 1;",
      "apps/web/src/a.ts": 'import { shared } from "@acme/shared";',
    });
    mkdirSync(path.join(root, "node_modules", "@acme"), { recursive: true });
    symlinkSync(path.join("..", "..", "packages", "shared"), path.join(root, "node_modules", "@acme", "shared"));

    expect(resolveImports(root, ["apps/web/src/a.ts"]).get("apps/web/src/a.ts")).toEqual([
      "packages/shared/src/index.ts",
    ]);
  });

  it("skips imports that resolve outside the project root", () => {
    const repoRoot = makeProject({
      "packages/shared/index.ts": "export const shared = 1;",
      "apps/web/a.ts": 'import { shared } from "../../packages/shared/index";',
    });
    const webRoot = path.join(repoRoot, "apps", "web");
    expect(resolveImports(webRoot, ["a.ts"]).get("a.ts")).toEqual([]);
  });

  it("skips npm packages installed in node_modules", () => {
    const root = makeProject({
      "node_modules/left-pad/package.json": JSON.stringify({ name: "left-pad", main: "index.js" }),
      "node_modules/left-pad/index.js": "module.exports = () => {};",
      "a.ts": 'import pad from "left-pad";',
    });
    expect(resolveImports(root, ["a.ts"]).get("a.ts")).toEqual([]);
  });

  it("ignores imports that cannot be found, and a file importing itself", () => {
    const root = makeProject({ "a.ts": 'import "./missing";\nimport "./missing.css";\nimport "./a";' });
    expect(resolveImports(root, ["a.ts"]).get("a.ts")).toEqual([]);
  });

  it("returns no imports for a file that was deleted after git was read", () => {
    const root = makeProject({});
    expect(resolveImports(root, ["gone.ts"]).get("gone.ts")).toEqual([]);
  });

  it("drops a Vite-style ?suffix on non-code imports", () => {
    const root = makeProject({ "a.ts": 'import logo from "./logo.svg?url";', "logo.svg": "<svg/>" });
    expect(resolveImports(root, ["a.ts"]).get("a.ts")).toEqual(["logo.svg"]);
  });
});

describe("toProjectPath", () => {
  const root = path.join("/", "work", "app");
  it("returns a forward-slash path inside the root", () => {
    expect(toProjectPath(root, path.join(root, "src", "a.ts"))).toBe("src/a.ts");
  });
  it("returns null outside the root or inside node_modules", () => {
    expect(toProjectPath(root, path.join("/", "work", "other", "a.ts"))).toBeNull();
    expect(toProjectPath(root, path.join(root, "node_modules", "x", "index.ts"))).toBeNull();
  });
  it("does not treat a name starting with two dots as outside", () => {
    expect(toProjectPath(root, path.join(root, "..hidden.ts"))).toBe("..hidden.ts");
  });
});
