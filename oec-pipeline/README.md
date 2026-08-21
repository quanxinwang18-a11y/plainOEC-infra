# oec-pipeline

`oec-pipeline` is an MCP-only Claude Code Plugin for executing existing `dev` or `test` pipelines.
It does not create, edit, copy, cancel, or delete pipelines and does not expose Gitee CRUD.

The Server binds every plan to an authorized canonical Git workspace, its exact `origin` remote,
ref, HEAD commit, remote pipeline configuration, selected stages, environment, and a 15-minute plan
token. `prod` and unknown environments are rejected. A run is executed only through the prepared
plan and carries a unique marker used to recover uncertain POST results without blind retries.

Runtime state is stored under `${CLAUDE_PLUGIN_DATA}`. The committed bundle runs on Node.js 20 or
newer without Plugin-local `node_modules`. Real pipeline execution is not claimed until a specific
non-production repository and pipeline receive separate authorization and acceptance.
