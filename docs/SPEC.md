# diffviz — AI Code Diff Visualizer Plan

## Problem

Since playing with AI and it's coding abilities, I discovered that the ideal workflow is generating a plan, and having the coding agent execute the plan in parts to build out a project. This workflow is what I believe is the best way when implementing new features or starting a project from scratch. However, what I realized happens is that the agent will build out each part and you are returned with a bunch of new files, code diffs, and a long AI summary. Are we at the point where we don't need to read what the AI writes? Can we trust it blindly? Honestly, that answer is not up to me since I am just a junior. I don't want to blatantly trust what AI writes because I want to UNDERSTAND what it is building. I also like to believe most software engineers still want to understand what the agent is writing at a high-level even if they don't want to read the code.

Anyways, this tool will be used by myself and I just want a high-level visualization of what the AI agent is writing. I imagine once the AI creates some code after a prompt, this tool will auto-generate a graphical view of what has occurred. I will be able to hover over these nodes and arrows to get a summary of the changes made at a specific part of the codebase. Personally, I learn better when I have something to visualize and not just endless text.

## Version 1.0.0

### Flow

The App runs locally in the project folder and builds a graph of the agent's changes live from git. After each prompt, it labels that graph with the agent's own description. A commit ends the session part and saves the final graph.

#### Launch

The user runs `npx diffviz` from the root of their project directory. This starts a local Node server with access to the project's files, serves the App's UI, and opens it in the browser. There is no folder picker: the App always works on the folder it was launched from. The user then starts a Claude Code session in the same directory, so the agent and the App share files without any extra permissions.

If the git tree is dirty at launch, the App warns the user to commit first, so uncommitted work doesn't mix into the graph.

#### Setup

On first launch in a project, the App adds two things:

- **CLAUDE.md instructions.** Appended to the end of an existing CLAUDE.md, or a new one is created. They tell the agent to rewrite `current.json` after every response using the schema in Agent output, to reuse existing layer ids, and to end each response by reminding the user that the graph is in the App and to commit if this part is complete.
- **Claude Code hooks.**
  - Prompt submitted: log the user's prompt to the current session part.
  - Agent finished: log the AI's response (read from the session transcript) and tell the App the turn is over, so it can check whether `current.json` was updated.

#### Session parts

A session part is the work done between two git commits. A coding session with an agent completes a task in parts, and each part is a session part. The baseline is always the last commit, so the graph is cumulative: it shows everything changed since that commit, across every prompt in the part, including small follow-up fixes.

#### Deterministic graph (live)

While the agent works, chokidar sees source files change and the App rebuilds the graph and pushes it to the UI:

1. git diff against the last commit gives the changed, deleted, and renamed files.
2. ts-morph reads each changed TypeScript file and resolves its imports.
3. Each changed file becomes a node, and each import becomes an arrow from the importer to the imported file, meaning the importer depends on it. Only one hop is included: imported files that were not changed appear as grayed-out nodes with no tooltip.

If the git tree is clean, no graph is shown.

Some files need special handling:

- **Non-TypeScript files** (CSS, JSON, `.env`, etc.) are plain nodes with no outgoing arrows, styled distinctly from TypeScript nodes. A TypeScript file that imports one still gets an arrow to it.
- **Deleted files** have a deleted style (red) and no arrows. Their tooltip says the file has been deleted.
- **Renamed files** keep a single node at the new path. Their tooltip says which file they were renamed from.

The deleted and renamed tooltips come from git, not the AI, so they are always accurate.

#### AI labels (after each prompt)

When the agent finishes responding, it rewrites a single `current.json` in the App's folder in the project directory. It reads the existing file first and describes the whole session part so far: one summary, the layers that group files, a description per file, and a label and description per arrow. The summary is updated each time, not written per prompt.

When `current.json` changes, the App:

1. Validates it with Zod.
2. Normalizes its paths and cross-checks it against the deterministic graph, discarding any file or relationship that doesn't match a real node or import edge.
3. Draws layer boxes around their files, shows the summary in the sidebar, and attaches descriptions as tooltips on nodes, arrows, and layers.
4. Saves a copy of that version in the session part's data, so every version is kept without relying on the agent to manage history.

#### Commit

When the user commits, the session part ends. The App detects the new commit, saves the final graph along with every `current.json` version and the prompt history, and starts a new session part from the new commit with an empty graph.

#### Failure cases

The graph never breaks or empties because of the AI. Each failure is a named error shown in the status bar:

- **AI output missing:** the agent finished (signalled by the hook) and code changed, but `current.json` did not. The App keeps whatever is already on screen and discards nothing.
- **AI output invalid:** `current.json` was written but failed Zod validation. The App shows the reason, keeps the deterministic graph, and keeps the labels from the last valid version.

### Stack

The App is a local web app: a Node server runs on the user's machine (giving it filesystem access) and serves a React UI in the browser. Everything is TypeScript so the App can visualize itself.

- **Frontend:** React + Vite + TypeScript
- **Graph rendering:** React Flow (xyflow) for nodes, edges, and tooltips
- **Auto-layout:** elkjs (layered algorithm) to position nodes and nest files inside layer boxes
- **Backend:** Node + Express, serves the UI and an API for graph data
- **Live updates:** Server-Sent Events, so the server can push a new graph to the browser whenever files or `current.json` change
- **Import parsing:** ts-morph to resolve each changed file's real imports, including path aliases
- **File watching:** chokidar to watch source files, `current.json`, and git for new commits
- **Git:** simple-git (or the git CLI) to get changed, deleted, and renamed files against the last commit
- **Validation:** Zod schema for `current.json` (the `AgentOutput` type)
- **Storage:** JSON files in the App's folder in the project directory, `.diffviz/` (`current.json`, saved versions, prompt and response logs, final graphs); no database

**Distribution:** published as an npm package and run with `npx`. Before publishing, the frontend is built with Vite into static files that ship inside the package, so only the server's libraries are installed as dependencies. A static website is deployed to Vercel so reviewers can try the App without installing anything. It has a simple homepage explaining the project, with two buttons: one opens a read-only demo of the graph (loaded from a pre-recorded session part and its current.json, fully interactive with hover tooltips), and one links to the GitHub repo. There is no hosted backend.

### Out of scope

- A UI for browsing previous session parts. Version 1.0.0 saves each session part's data (final graph, every `current.json` version, and the prompt history), but browsing it in the App comes in a later version.
- AI-drawn data flow arrows. In version 1.0.0, the AI can only label existing import edges; any relationship that doesn't match a real import is discarded.
- Languages other than TypeScript. Version 1.0.0 only parses imports in TypeScript files; support for more languages comes later.
- Comparing prompts. Seeing what one prompt changed next to another (for example, prompt 3 vs prompt 4 in a session part) by diffing two saved graphs and their `current.json` versions. Version 1.0.0 already saves every version and the prompt history, so this needs no change to what is recorded; the comparison view comes in a later version.
- A database. Version 1.0.0 stores everything as JSON files. A local database for querying history across session parts may come in a later version.

### How to test

The test project is a new job tracker app (mock Gmail data, a dashboard, and an Express backend) with its own separate scaffold plan. It is scaffolded without the App and committed, so the first session part starts from a clean tree. Features are then built on it with the App running, a few prompts at a time.

Testing is manual, by watching the UI as the agent works:

- While the agent edits code, every changed file appears as a node, with grayed-out nodes and arrows for its imports.
- After each prompt, files are grouped into layers, the summary appears in the sidebar, and hovering over nodes, arrows, and layers shows their descriptions.
- Deleted, renamed, and non-TypeScript files show their own styles.
- Breaking `current.json` on purpose shows the named errors in the status bar without breaking the graph.
- Committing ends the session part, saves it, and clears the graph.

Once the core works, the App is also run on its own repo while it is being built.

### UI

The layout is similar to Cursor: a sidebar on the left and the graph view on the right.

- **No changes yet:** when the git tree is clean, the sidebar shows the folder name and the graph area shows an empty message.
- **Session part in progress:** the top of the sidebar shows the folder name, and below it is the cumulative AI summary of the current session part from current.json. The right side shows the graph: each layer is a box labelled with its layer name that contains its file nodes, with arrows between files.
- **Tooltips:** hovering over a node, arrow, or layer box shows its tooltip.
- **Status bar:** a small bar at the top of the graph area shows statuses and the named errors (dirty tree warning, AI output missing, AI output invalid).
- **Legend:** in the bottom-right corner of the graph area, explaining the node styles (changed, grayed-out import, non-TypeScript, deleted, renamed).
- A sidebar section for going through previous session parts is planned, but out of scope for version 1.0.0.

### Visual design

Dark theme, similar to Cursor. The reference mockup is `design/mockup.html` in the repo.

| Token | Value | Used for |
| --- | --- | --- |
| Background | `#14161a` | App and graph area, with a `#23262c` 1px dot grid every 20px |
| Panel | `#1b1e23` | Sidebar, legend |
| Status bar | `#181a1f` | Bar above the graph |
| Border | `#2a2e35` | Panel dividers |
| Layer border | `#3a3f48` | Layer boxes, tooltips |
| Text | `#e6e8eb` | Primary text |
| Text secondary | `#d4d8dd` | Summary, tooltip body |
| Text muted | `#9aa1ab` | Labels, metadata |
| Accent | `#8fbaff` | Hovered arrow, tooltip title, links |
| Edge | `#7c8592` | Import arrows |
| Edge to unchanged file | `#4f5560` | Arrows to grayed-out nodes |

**Type:** Inter for UI text (14px body, 11px uppercase section labels with 0.08em letter spacing), JetBrains Mono 12px for file names and paths.

**Node styles** (188×40px, 6px radius, 1.5px border):

| Style | Border | Fill | Text |
| --- | --- | --- | --- |
| Changed | solid `#6aa9ff` | `#1d2736` | `#e6e8eb` |
| Unchanged import | dashed `#4f5560` | `#17191d` | `#8b929c` |
| Non-TypeScript | dotted `#e0a050` | `#2b2318` | `#e6e8eb` |
| Deleted | solid `#f07a7a` | `#2e1c1e` | `#f3a3a3`, struck through |
| Renamed | solid `#b39cf5` | `#241f36` | `#e6e8eb`, plus a small "renamed" tag |

**Layers:** 12px radius, 1px `#3a3f48` border, faint fill, layer name in 12px semibold above the box.

**Arrows:** 1.5px, filled triangle head; the hovered arrow becomes 2.5px in the accent color.

**Tooltip:** `#22262d` card, 1px `#3a3f48` border, 8px radius, soft shadow; a short accent-colored label over the description.

### Graph state (sent to the UI)

What the server sends to the UI over SSE. It combines what the server verified from git and ts-morph with the agent's output.

```typescript
// Everything the UI needs to draw one moment of a session part.
// The server sends the whole object on every update.
type GraphState = {
  sessionPart: number,              // increments by 1 for each session part, starting at 1
  baseCommit: string,               // hash of the commit this session part started from
  isClean: boolean,                 // true when the git tree is clean; no graph is shown
  errors: StatusError[],            // shown in the status bar; empty when all is well
  nodes: GraphNode[],               // every changed file plus one hop of unchanged imports
  edges: GraphEdge[],               // imports between those files
  agentOutput: AgentOutput | null,  // filtered current.json; null until a valid one exists
}

// One file in the graph. Built from git and ts-morph only, never from the agent.
type GraphNode = {
  id: string,             // relative path from the project root, normalized
  status: NodeStatus,     // sets the node's colour
  isTypeScript: boolean,  // sets the node's border style
  oldPath?: string,       // previous path; only present when status is "renamed"
}

// One import. Points from the file that imports to the file it imports.
type GraphEdge = {
  id: string,      // `${source}->${target}`
  source: string,  // GraphNode id of the importing file
  target: string,  // GraphNode id of the imported file
}

// How a file changed since baseCommit.
type NodeStatus =
  | "changed"          // added or modified
  | "unchangedImport"  // not changed, but imported by a changed file; drawn grayed out
  | "deleted"
  | "renamed";

// One message in the status bar.
type StatusError = {
  code:
    | "dirtyAtLaunch"     // the tree had uncommitted changes when the App started
    | "aiOutputMissing"   // the agent finished and code changed, but current.json did not
    | "aiOutputInvalid",  // current.json failed Zod validation
  message: string,        // human-readable details, e.g. the Zod validation reason
}
```

- `agentOutput` is `current.json` after the server has validated and filtered it: file notes and relationships that don't match a real node or edge are already removed. If a new `current.json` is invalid, `agentOutput` keeps the last valid version.
- The UI joins the two by id: a `GraphNode` id matches `FileNote.path` and the paths in `Layer.paths`, and a `GraphEdge`'s `source` and `target` match a `Relationship`'s.
- `GraphNode`, `GraphEdge` and `StatusError` avoid the names `Node` and `Error`, which are already built into the browser and JavaScript.

### Agent output (`current.json`)

What the agent writes after every response. The server validates it with Zod before using it.

```typescript
// The whole current.json file. Describes everything changed in the
// current session part, not just the latest prompt.
type AgentOutput = {
  schemaVersion: number,          // starts at 1; bumped whenever this shape changes
  summary: string,                // cumulative summary of the session part, shown in the sidebar
  files: FileNote[],              // one description per file, shown as node tooltips
  layers: Layer[],                // groups of files, drawn as boxes around their nodes
  relationships: Relationship[],  // labels for import arrows, shown as arrow tooltips
}

// The agent's description of one file.
type FileNote = {
  path: string,         // relative path from the project root; must match a GraphNode id
  description: string,  // what changed in this file and why
}

// A group of related files, such as "UI", "API" or "Database".
type Layer = {
  id: string,           // stable across rewrites of current.json; the agent reuses it
  name: string,         // label drawn above the box; may change between rewrites
  description: string,  // shown as the layer's tooltip
  paths: string[],      // files in this layer, by relative path
}

// The agent's label for one import arrow.
type Relationship = {
  source: string,       // path of the importing file
  target: string,       // path of the imported file
  label: string,        // short label, e.g. "renders" or "fetches from"
  description: string,  // longer explanation, shown as the arrow's tooltip
}
```

- All paths are relative to the project root, normalized to one form (no leading `./` or `/`, forward slashes, extension included). The server normalizes both sides before matching.
- `files` holds every file description. `Layer.paths` only lists paths, so descriptions have one source of truth.
- A file does not have to belong to a layer. A file should belong to at most one layer; if the agent puts it in more than one, the server keeps it in the first layer it appears in, ignores the rest, and logs a warning.
- Layer `id`s stay the same across versions of `current.json`. The agent reuses existing ids; names and descriptions can change.
- A relationship's `source` and `target` must match a real import edge, or the relationship is discarded.

### Build plan

The agent builds version 1.0.0 in parts, one part at a time. Each part ends with a working checkpoint I can run and a commit, so each part is also a session part once the App can visualize itself.

**Rules for every part:**

1. Before writing code, propose a short plan for the part: the files to create or change and the key functions. Wait for my approval.
2. Build only that part. Do not start the next one or add features from later parts.
3. When the part is done, write tests for it (unit tests, and fixture tests where they apply) for me to review, explain how to run its checkpoint, then run the understanding check (below).
4. Stop and wait for me to commit before starting the next part.

**Parts:**

1. **Skeleton.** Express server and Vite + React frontend in one TypeScript project. A CLI entry point that starts the server in the current folder, serves the UI, and opens the browser. Dev mode with hot reload. *Checkpoint:* running it in any folder shows the empty UI with that folder's name.
2. **Git state.** Detect a clean or dirty tree, get changed, deleted, and renamed files against the last commit, and detect new commits. Status bar shows the state, including the dirty tree warning. *Checkpoint:* editing a file in a test repo changes the status bar; committing resets it.
3. **Import graph.** ts-morph resolves imports for changed files, one hop. Build the `GraphState` object (nodes and edges, with node styles for changed, unchanged import, non-TypeScript, deleted, renamed). chokidar triggers rebuilds, pushed to the UI over Server-Sent Events. *Checkpoint:* the graph object updates live in the browser (raw JSON is fine).
4. **Graph rendering.** React Flow + elkjs draw the graph with the Visual design styles, the legend, and git-derived tooltips for deleted and renamed files. *Checkpoint:* editing files in the job tracker draws a correct, readable graph.
5. **AI output.** Zod schema for `current.json`, path normalization, cross-checking and discarding, layer boxes, node, arrow, and layer tooltips, the sidebar summary, saved versions, and both named errors. *Checkpoint:* a hand-written `current.json` labels the graph; a broken one shows the right error.
6. **Agent integration and session parts.** Setup writes the CLAUDE.md instructions and the Claude Code hooks. Hook commands log prompts and responses and signal when the agent finishes. A commit saves the session part and clears the graph. *Checkpoint:* a real Claude Code session on the job tracker produces a labelled graph, and committing saves it.
7. **Package and demo.** Publish as an npm package runnable with `npx`, the Vercel site (a homepage explaining the project, with buttons to the read-only demo and the GitHub repo; the demo loads a pre-recorded session part), and a README. *Checkpoint:* `npx` works from a fresh folder, and the demo link works with nothing installed.

### Understanding checks

I want to understand the code the agent writes, not just approve it. After each part, the agent tests me before I commit:

- Ask 2 to 4 questions about the most important code in that part: core functions, how data flows between modules, key design decisions, and edge cases the code handles.
- Never ask about trivial things: imports, config files, boilerplate, styling, or anything I could answer by reading one line.
- Ask open questions I answer in my own words, one at a time. Do not give hints or answers before I try.
- After each answer, say honestly whether it is right, correct anything I missed, and point to the file and function involved.
- If I clearly don't understand something, explain it, then ask one follow-up question on it before moving on.

## After 1.0.0

After 1.0.0 ships, the App grows one focused version at a time, each with a measured before and after.

### How I work on it

- **Specs live in the repo.** Once coding starts, this plan is copied to `docs/SPEC.md` and the repo copy becomes the source of truth. Each later version gets its own short spec in `docs/specs/` (for example `docs/specs/1.1-trust-check.md`) before any code: goal, decisions, out of scope, and how it will be tested.
- **Agent rules live in `CLAUDE.md`.** Examples: the `current.json` schema is the contract, so changing it means bumping `schemaVersion`, updating fixtures and updating the parser in the same commit; the graph must render with the AI step turned off.
- **One change per pull request.** Each PR does one thing and passes CI before merging.
- **Short writeups for changes worth explaining.** I write them (the agent can draft, I edit) in `docs/notes/`, for example `docs/notes/2026-12-large-diffs.md`: the problem, what changed, and the evidence (a number, a screenshot, or a failing case that now passes). A few sentences each; only for changes with something measured or decided.
- **CI on every PR** (GitHub Actions): lint, typecheck, unit tests, and fixture tests. CI never calls a real model: it uses recorded `current.json` files, so it is free, fast, and gives the same result every run.

### Fixtures and evals

- **Fixtures** are small TypeScript repos checked into `fixtures/`, each with a recorded agent change and a recorded `current.json`. Tests run the App's code on them and compare the graph to the expected one, so deterministic parsing and validation are tested without Claude Code or a model.
- **Evals** use the same fixture changes plus a graph I label by hand (the layers and arrows I would draw). Running the real agent on them and scoring how often its layers and labels match mine gives a number like "layers matched on 14 of 20 changes". Evals run on demand, not in CI, because they call a real model.
- **What evals do and don't do.** They measure; they don't make the model or the App better by themselves. I improve the score by changing the `CLAUDE.md` instructions, the schema, or the cross-checks, then re-run the evals to prove the change helped.

### Roadmap

The version roadmap is kept in a separate doc, `docs/ROADMAP.md` in the repo, because it is still a draft. Each version gets its own spec in `docs/specs/` before any code.

## Future considerations

- A file belonging to more than one layer. In a well-structured project, a file should only belong to one layer, but some projects mix frontend and backend code in a single file. Revisit if that comes up.
