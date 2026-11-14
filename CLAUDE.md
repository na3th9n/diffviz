# CLAUDE.md

This repo is diffviz ("the App"), an AI code diff visualizer: a local tool that graphs the changes a coding agent makes to a TypeScript project, live from git, and labels the graph with the agent's own description.

## Source of truth

- `docs/SPEC.md` is the full plan for version 1.0.0. Read it before starting any work, and follow it over your own assumptions.
- `design/mockup.html` is the visual reference for the UI. Match it together with the Visual design section of the spec. Use React Flow + elkjs for the graph; do not copy the mockup's hand-placed positions.
- `docs/ROADMAP.md` is a draft of later versions. Do not build anything from it unless I ask.
- If the spec is unclear or seems wrong, stop and ask. Do not guess, and do not change the spec yourself.

## How we work: one part at a time

The spec's Build plan splits version 1.0.0 into numbered parts. For every part:

1. **Plan first.** Before writing code, propose a short plan: the files you will create or change and the key functions. Wait for my approval.
2. **Build only that part.** Do not start the next part or add features from later parts or from the roadmap.
3. **Write tests** for the part (unit tests, and fixture tests where they apply). I will review them.
4. **Explain the checkpoint:** how to run it and what I should see.
5. **Run the understanding check** (below).
6. **Stop.** Wait for me to commit before starting the next part.

Keep changes small and focused. If a part turns out bigger than expected, say so and propose how to split it.

## Understanding check

I want to understand the code you write, not just approve it. After each part, before I commit:

- Ask 2 to 4 questions about the most important code in that part: core functions, how data flows between modules, key design decisions, and edge cases the code handles.
- Never ask about trivial things: imports, config files, boilerplate, styling, or anything I could answer by reading one line.
- Ask open questions I answer in my own words, one at a time. Do not give hints or answers before I try.
- After each answer, say honestly whether it is right, correct anything I missed, and point to the file and function involved.
- If I clearly don't understand something, explain it, then ask one follow-up question on it before moving on.

## Rules that must always hold

- **The App is published to npm as `diffviz`** and run with `npx diffviz` from a project's root.
- **Everything is TypeScript**, frontend and backend, so the App can visualize itself.
- **The graph comes from git and ts-morph, never from the agent.** Nodes and edges are built deterministically. The agent's `current.json` only adds labels, layers, descriptions, and the summary.
- **The graph must still render with no `current.json`, or an invalid one.** Never let AI output break or empty the graph.
- **`current.json` is a contract.** Its shape is the `AgentOutput` type in the spec. Changing it means bumping `schemaVersion` and updating the Zod schema, any fixtures, and the parser in the same change.
- **Never trust agent output.** Validate it with Zod, normalize paths, and drop any file note or relationship that does not match a real node or import edge.
- **Use the type and field names from the spec** (`AgentOutput`, `FileNote`, `Layer`, `Relationship`, `GraphState`, `GraphNode`, `GraphEdge`, `NodeStatus`, `StatusError`). Do not use `Node`, `File`, or `Error` as type names; they clash with built-ins.
- **Arrows point from the importer to the imported file.**
- **No database in version 1.0.0.** Storage is JSON files in the App's folder in the project directory, `.diffviz/`.
- **Tests never call a real model.** Use recorded `current.json` files.

## Stack

React + Vite + TypeScript, React Flow (xyflow), elkjs, Node + Express, Server-Sent Events, ts-morph, chokidar, simple-git, Zod. Do not add other dependencies without asking first and saying why.

## Code style

- Prefer small, readable functions with clear names over clever code.
- Add a short comment where the reason for the code is not obvious from the code itself.
- Handle errors explicitly; do not swallow them.
- Run the typecheck and tests before saying a part is done.
