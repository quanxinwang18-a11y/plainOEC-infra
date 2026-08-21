# oec-e3

`oec-e3` is an MCP-only Claude Code Plugin for guarded E3 platform operations. It has no Agent,
Skill, Command, Hook, default settings, or generic CRUD surface.

The Plugin exposes the four existing PRD publication tools plus six bounded tools for
development-task planning, requirement selection, creation, progress, and status verification.
`oec-product@3.x` declares `oec-e3@~1.0.0` as a native dependency; Product installation therefore
loads this Server without embedding a second E3 runtime.

Runtime state is stored under `${CLAUDE_PLUGIN_DATA}`. The committed `dist/e3-server.mjs` bundle runs
on Node.js 20 or newer without Plugin-local `node_modules`.

## Tools

```text
prepare_prd_publish
select_product_space
execute_prd_publish
get_prd_publish_status
prepare_development_tasks
select_development_requirement
execute_development_tasks
prepare_task_progress
execute_task_progress
get_development_task_status
```

Every remote write is derived from a short-lived immutable plan and requires host user interaction.
The Server does not expose generic E3 CRUD, defect/test-request workflows, arbitrary field edits, or
arbitrary payloads.

## Real acceptance

On 2026-08-21, the authorized non-production space `OBU-AI提效组` completed a real journey with new
`oec-e3` Plugin Data: PRD publication and status, exact repeat reuse, development task creation and
reuse, start, worklog, completion, and final status verification. The final task read-back reported
status `3`, progress `100`, and `1.0h` spent. Remote objects were retained; no real partial failure was
injected.

The detailed evidence and limits are recorded in
[E3 platform 3.0.0 real acceptance](../docs/evidence/e3-platform-3.0.0-real-acceptance.md).
