# oec-e3

`oec-e3` is an MCP-only Claude Code Plugin for guarded E3 platform operations. It has no Agent,
Skill, Command, Hook, default settings, or generic CRUD surface.

The Plugin exposes the four existing PRD publication tools plus six bounded tools for
development-task planning, requirement selection, creation, progress, and status verification.
`oec-product@3.x` declares `oec-e3@~1.0.0` as a native dependency; Product installation therefore
loads this Server without embedding a second E3 runtime.

Runtime state is stored under `${CLAUDE_PLUGIN_DATA}`. The committed `dist/e3-server.mjs` bundle runs
on Node.js 20 or newer without Plugin-local `node_modules`.
