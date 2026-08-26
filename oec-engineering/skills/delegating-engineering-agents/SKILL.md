---
name: delegating-engineering-agents
description: Explicitly routes a bounded engineering change to an OEC research, implementation, or check Agent, including a user-requested sequential full flow. Do not use for ordinary coding, research, review, planning, closing, or automatic workflow orchestration.
argument-hint: "[change-id] <research|implement|check|full> [question]"
disable-model-invocation: true
---

# Delegating engineering agents

Coordinate host-native delegation from the main session. Do not perform the delegated research,
implementation, or check yourself, and do not load Agent Markdown files by path.

## Select a mode

Require one explicit mode. If it is absent or ambiguous, show the argument hint and stop.

- `research`: require an existing change ID and a concrete research question; dispatch
  `oec-research`, then report its result.
- `implement`: require an existing change ID; dispatch `oec-implement`, then report its result.
- `check`: require a non-empty current working-tree diff; dispatch `oec-check`. A change ID is
  optional and supplies additional context when present.
- `full`: require an existing change ID and a concrete research question; run `oec-research`, then
  `oec-implement`, then `oec-check`, strictly in that order.

## Preflight

For `research`, `implement`, and `full`, make the first repository operation a direct existence
check for `ai-docs/engineering/changes/<change-id>/change.md`. Do not inspect Git status, other
Skills, or surrounding directories until it succeeds. If it does not exist, report `blocked` in the
next response and run no further tools. Never create or guess a change package.

For `check`, run `git status --short` and confirm there are staged, unstaged, or untracked changes.
If there is no diff to inspect, report `blocked` and stop.

Before `full`, run `git status --short`. Proceed with pre-existing changes only when the user has
explicitly confirmed that every listed path belongs to the same change or is safe to coexist with
it. Never stash, reset, clean, stage, or commit those paths.

## Dispatch

Use the host's native Agent delegation and select the exact Agent name. Give the Agent only the
change ID, selected mode, and research question when applicable; the Agent loads its persisted
change context and team Specs itself.

Treat a missing status as `partial`. Continue a `full` flow only when the previous Agent reports
`complete` with the verification required by its own contract:

1. After research, read the reported research files. If a finding requires a design, boundary, or
   compatibility decision, stop and return control to the main session so the change package can
   be updated.
2. After implementation, stop on `partial`, `failed`, or `blocked`; do not dispatch the check.
3. After the check, surface judgment issues to the main session. Do not send them back to the
   implementation Agent automatically.

Never run Agents concurrently in `full`, create an automatic retry loop, modify the delegated
artifacts yourself, close the change, or write E3, Pipeline, SAE, UTP, deployment, or remote Git
state.

## Report

Return a compact coordination report containing:

- selected mode and change ID, if any;
- each dispatched Agent and its reported status;
- research files, changed files, fixes, and verification evidence reported by the Agents;
- the stop reason and next required main-session or user action.

Do not claim that the engineering change is closed. Final evidence reconciliation and any exact-path
commit remain the responsibility of `closing-engineering-changes`.
