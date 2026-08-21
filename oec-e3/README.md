# oec-e3

`oec-e3` is an MCP-only Claude Code Plugin for guarded E3 platform operations. It has no Agent,
Skill, Command, Hook, default settings, or generic CRUD surface.

The current migration stage exposes the four existing PRD publication tools plus six bounded tools
for development-task planning, requirement selection, creation, progress, and status verification.
The Plugin is not added to the Marketplace until the Product dependency cutover, so normal
installations cannot load both the legacy embedded Server and this Server.

Runtime state is stored under `${CLAUDE_PLUGIN_DATA}`. The committed `dist/e3-server.mjs` bundle runs
on Node.js 20 or newer without Plugin-local `node_modules`.
