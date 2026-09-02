---
name: delegate-agents
description: Routes a bounded engineering change identified by a canonical taskRef or legacy change ID to a researcher, implementer, or checker, including an explicitly requested one-pass sequence. Do not use for ordinary coding, research, review, planning, closing, long-running runtime evaluation, or automatic workflow orchestration.
argument-hint: "[taskRef] <research|implement|check|sequence> [question]"
disable-model-invocation: true
---

# Delegate agents

Coordinate host-native delegation from the main session. Do not perform delegated work yourself, load
Agent Markdown files by path, or turn delegation into a workflow engine.

## Select a mode

Require one explicit mode. If it is absent or ambiguous, show the argument hint and stop.

- `research`: require an existing taskRef and a concrete question; dispatch `researcher`.
- `implement`: require an existing taskRef; dispatch `implementer`.
- `check`: require a non-empty current working-tree diff; a taskRef is optional.
- `sequence`: require an existing taskRef and a concrete research question; run
  `researcher → implementer → checker` strictly in that order.

Legacy change IDs are accepted only as resolver aliases. Before dispatch, normalize and retain the
canonical taskRef.

## Preflight

For `research`, `implement`, and `sequence`, make the first repository operation a task existence
check through:

```bash
oec-spec task resolve --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --format json
```

If it does not resolve to an existing task, report `blocked` and run no further repository tools.
Never create or guess a task package. For `check`, run `git status --short` and require staged,
unstaged, or untracked changes.

Before `sequence`, confirm that every pre-existing changed path belongs to the same task or is safe to
coexist. Never stash, reset, clean, stage, or commit those paths.

## Dispatch and reporting

Give each Agent only the canonical taskRef, selected mode, and research question when applicable.
Agents load their own task Spec/Design and selected Specs. Treat a missing status as `partial`.
Continue a sequence only when the previous Agent reports `complete` with its required verification;
stop on `partial`, `failed`, or `blocked`, or on a finding requiring a design/boundary decision.

Never run Agents concurrently in `sequence`, create an automatic retry loop, modify delegated task
artifacts yourself, close the task, or write E3, Pipeline, deployment, or remote Git state. A sequence is coordination evidence, not task closure; `close-change` remains a separate explicit action.

Return a compact report containing the canonical taskRef, selected mode, each Agent status, research
files, changed files, fixes, verification evidence, stop reason, and next main-session action.
