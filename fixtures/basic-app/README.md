# basic-app fixture

A small TypeScript project used by diffviz's import-graph tests. It is never
built or run; the tests copy it into a temporary git repository, change files,
and check the graph diffviz builds.

It covers: a `@/*` path alias, imports without extensions, a folder `index.ts`,
a `.js` specifier that points at a `.ts` file, `import type`, `export … from`,
a dynamic `import()`, an npm package import, and CSS, CSS module and JSON imports.
