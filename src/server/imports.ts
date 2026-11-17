import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { Project, SyntaxKind, ts, type SourceFile } from "ts-morph";

// For each file (project-relative path), the project files it imports.
export type ImportMap = Map<string, string[]>;

// Used when a file has no tsconfig.json above it: settings that match a
// typical modern TypeScript project (Vite, Node ESM).
const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
};

// Lets TypeScript's resolver find .js and .json files too, so a TypeScript file
// importing one still gets an arrow. Only affects resolution, never type-checking.
const RESOLUTION_OVERRIDES: ts.CompilerOptions = { allowJs: true, resolveJsonModule: true };

// Finds what each of `files` imports, using TypeScript's own module resolution
// with each file's nearest tsconfig.json, so path aliases, folder index files,
// ".js"-to-".ts" mapping and workspace packages resolve like they do in the editor.
// Imports of npm packages and of files outside the project root are left out.
export function resolveImports(projectRoot: string, files: string[]): ImportMap {
  // Resolved paths come back with symlinks followed (on macOS, /var is really
  // /private/var), so compare against the real path of the root as well.
  const root = realpathSync(projectRoot);
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const optionsCache = new Map<string, ts.CompilerOptions>();
  const imports: ImportMap = new Map();

  for (const file of files) {
    const absolute = path.join(root, file);
    const sourceFile = parseFile(project, absolute);
    if (sourceFile === null) {
      imports.set(file, []);  // deleted between the git read and now; the next refresh catches up
      continue;
    }
    const options = compilerOptionsFor(absolute, optionsCache);
    const targets = new Set<string>();
    for (const specifier of listModuleSpecifiers(sourceFile)) {
      const resolved = resolveSpecifier(specifier, absolute, options);
      const target = resolved === null ? null : toProjectPath(root, resolved);
      if (target !== null && target !== file) targets.add(target);
    }
    imports.set(file, [...targets].sort());
  }
  return imports;
}

// Returns null if the file no longer exists.
function parseFile(project: Project, absolute: string): SourceFile | null {
  if (!existsSync(absolute)) return null;
  return project.createSourceFile(absolute, readFileSync(absolute, "utf8"), { overwrite: true });
}

// Every module path the file imports from: import and export-from declarations
// (including `import type` and side-effect imports like `import "./x.css"`),
// and dynamic `import("./x")` with a fixed string.
export function listModuleSpecifiers(sourceFile: SourceFile): string[] {
  const specifiers: string[] = [];
  for (const declaration of sourceFile.getImportDeclarations()) {
    specifiers.push(declaration.getModuleSpecifierValue());
  }
  for (const declaration of sourceFile.getExportDeclarations()) {
    const value = declaration.getModuleSpecifierValue();
    if (value !== undefined) specifiers.push(value);  // `export { a }` without `from` has none
  }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
    const [argument] = call.getArguments();
    if (argument && (argument.isKind(SyntaxKind.StringLiteral) || argument.isKind(SyntaxKind.NoSubstitutionTemplateLiteral))) {
      specifiers.push(argument.getLiteralValue());
    }
  }
  return specifiers;
}

// Returns the absolute path `specifier` points to, or null if it cannot be found.
function resolveSpecifier(specifier: string, containingFile: string, options: ts.CompilerOptions): string | null {
  const resolved = ts.resolveModuleName(specifier, containingFile, options, ts.sys).resolvedModule;
  if (resolved) return resolved.resolvedFileName;

  // TypeScript only resolves code files. For a relative import of anything else
  // (CSS, SVG, ...), check the file exists. Vite-style suffixes like "?url" are dropped.
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const candidate = path.resolve(path.dirname(containingFile), specifier.replace(/[?#].*$/, ""));
  return isFile(candidate) ? candidate : null;
}

// The compiler options of the tsconfig.json nearest to `file`, walking up the folders
// like the editor does. Cached per tsconfig for the length of one resolveImports call.
function compilerOptionsFor(file: string, cache: Map<string, ts.CompilerOptions>): ts.CompilerOptions {
  const configPath = ts.findConfigFile(path.dirname(file), ts.sys.fileExists, "tsconfig.json");
  const key = configPath ?? "";
  let options = cache.get(key);
  if (options === undefined) {
    options = { ...(configPath ? loadCompilerOptions(configPath) : DEFAULT_OPTIONS), ...RESOLUTION_OVERRIDES };
    cache.set(key, options);
  }
  return options;
}

// Reads a tsconfig.json, following "extends". A tsconfig that cannot be read
// (for example half-written by the agent) falls back to the defaults, so one
// broken config never empties the graph.
function loadCompilerOptions(configPath: string): ts.CompilerOptions {
  let fatal: string | null = null;
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      fatal = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    },
  });
  if (!parsed || fatal !== null) {
    console.warn(`diffviz: could not read ${configPath}${fatal ? ` (${fatal})` : ""}; using default settings.`);
    return DEFAULT_OPTIONS;
  }
  return parsed.options;
}

// Converts an absolute path to a project path ("src/App.tsx"), or null if it is
// outside the project root or inside node_modules (an npm package, not project code).
export function toProjectPath(root: string, absolute: string): string | null {
  const relative = path.relative(root, absolute);
  if (relative === "" || path.isAbsolute(relative)) return null;
  const parts = relative.split(path.sep);
  if (parts[0] === ".." || parts.includes("node_modules")) return null;
  return parts.join("/");
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;  // missing or unreadable: treated as "no such file"
  }
}
