# diffviz — Version Roadmap

Draft. Not final; I'm still deciding what comes after 1.0.0.

| Version | Focus | What it adds |
| --- | --- | --- |
| 1.1 | Trust check | A warnings panel where the AI's labels disagree with git: changed files the AI didn't describe, relationships it claimed that were discarded, and changes to shared types it didn't mention. Replaces silent discarding |
| 1.2 | Evals | Fixture repos with hand-labeled graphs and a script that scores the agent's labels against them. The score goes in the README |
| 1.3 | History | A local SQLite database for session parts, `current.json` versions and prompts. UI for browsing previous session parts and comparing what two prompts changed |
| 1.4 | Terminal | The core (git, parsing, graph, trust check) split from the UI. A CLI: `check` prints the trust-check warnings and exits non-zero on problems; `--json` prints the graph |
| 2.0 | Any agent | A git-only mode that works with Codex, Cursor or hand-written changes; Claude Code hooks become an optional richer source. Possibly an MCP server |

Not planned: other languages, accounts, or a hosted backend. A hosted share link (a reviewer opens the graph for a PR) is only worth building if people ask for it.

To decide later: how the App compares to similar tools.
