# Recorded agent output

Hand-written `current.json` files for the tests, so no test ever calls a real model.

They all describe the same change to `fixtures/basic-app`: `src/App.tsx` edited, and a new
`src/utils/date.ts` that imports `src/utils/format.ts`.

| File | What it tests |
| --- | --- |
| `valid.json` | A correct file: every path and relationship matches the graph |
| `messy-paths.json` | Valid shape, but with paths written in other forms, unknown files, a file in two layers, a note for an unchanged import, a relationship that is not an import, and an extra field |
| `invalid-json.json` | Not JSON at all (cut off mid-write) |
| `wrong-types.json` | JSON with the wrong shape: a number for a path and no summary |
| `wrong-version.json` | A `schemaVersion` this version of the App does not read |
