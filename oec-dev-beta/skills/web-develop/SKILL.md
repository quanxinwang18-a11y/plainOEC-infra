---
name: web-develop
description: Coordinates an explicitly requested non-trivial Web or full-stack taskRef through resumed implementation, Playwright runtime evaluation, bounded repair cycles, and a final fresh check as an experimental capability. Do not use for small fixes, non-Web work, production operations, planning alone, review alone, or closing.
argument-hint: "[existing taskRef or currently confirmed change]"
disable-model-invocation: true
---

# Develop Web

This is an experimental `oec-dev-beta` capability. Coordinate from the main session without creating a
workflow engine or allowing delegated Agents to communicate directly.

Reuse the host-discovered `implementer`, `evaluator`, `checker`, and `oec-spec` when they are available.
Do not copy their instruction files, create replacement Agents, or add another
runtime. If a required host capability is unavailable, report `blocked`.

## Qualify and resolve

Require a non-trivial Web or full-stack task with a runnable user journey and observable UI, API, or
persistent-state behavior. Return `not-applicable` for a small local fix, documentation, review,
diagnosis, non-Web work, an unrunnable project, or production operations.

Require an existing canonical `taskRef` or an explicitly confirmed legacy change ID. Resolve it with:

```bash
oec-spec task resolve --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --format json
```

If the input is a PRD, Story, issue, or product brief without a task pair, return control to the main
session to use `code-plan`. Do not invent or create product scope inside this Skill. Ambiguous
candidates block; never choose the latest file.

## Preflight

Read the resolved task Spec/Design, explicit Product sources, related ADRs, and path-selected Specs.
Confirm all pre-existing working-tree paths with the user. Derive one in-session runtime checklist
from the task Spec's `AC-NNN` acceptance items and preserve those IDs. Add only environment setup or
observation details; do not create a second acceptance source or redefine behavior. Do not persist
the checklist. Require a local or explicitly authorized internal non-production target.

Require Claude Code Agent Teams to be off and a user- or team-configured `playwright` MCP server to
be connected. If required Playwright tools are unavailable, report `blocked`; never substitute static
tests for runtime acceptance.

## Run the loop

1. Dispatch the host `implementer` once with the canonical taskRef, checklist, and explicit reference paths. Retain the returned Agent ID.
2. Dispatch the host `evaluator` once with the same inputs, target, changed paths, and observed results. Retain that Agent ID.
3. On a runtime failure, forward complete structured findings through the main session to the same implementation Agent. Do not summarize them or forward implementer self-assessment to evaluator.
4. Resume the same implementation Agent, then the same evaluation Agent. Every evaluation reruns the complete user journey and all applicable gates.
5. Stop on scope expansion, product or architecture judgment, incomplete evidence, repeated findings in two consecutive cycles, or two cycles without meaningful code changes.

Run at most five build-and-evaluate cycles by default. If the fifth cycle does not pass, stop and ask
whether to continue. Explicit continuation may run up to ten total cycles; never exceed ten.

After runtime evaluation passes, dispatch the host `checker`. Stop on judgment issues. If the check
changes code, resume the evaluator for a complete runtime recheck if the budget permits.

## Report

Report the canonical taskRef, roots, Agent statuses, cycle count, changed files, runtime evidence,
final check, unresolved findings, and stop reason. Do not create state files, snapshots, branches,
commits, closing artifacts, E3/Pipeline state, deployments, or remote Git changes. Harness pass is not
task closure; the user must separately decide whether to invoke `code-finish`.
