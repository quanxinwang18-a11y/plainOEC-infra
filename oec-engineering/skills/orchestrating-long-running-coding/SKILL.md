---
name: orchestrating-long-running-coding
description: Coordinates an explicitly requested non-trivial Web or full-stack change through resumed implementation, Playwright runtime evaluation, bounded repair cycles, and a final fresh check. Do not use for small fixes, non-Web work, production operations, planning alone, review alone, or closing.
argument-hint: "[goal, PRD/story, task/issue, existing change, or explicit reference files]"
disable-model-invocation: true
---

# Orchestrating long-running coding

Coordinate from the main session. Do not fork this Skill, create workflow files, or let delegated
Agents communicate directly.

## Qualify the request

Require a non-trivial Web or full-stack change with a runnable user journey and observable UI, API,
or persistent-state behavior. Return `not-applicable` for a small local fix, documentation, review,
diagnosis, non-Web work, an unrunnable project, or production operations.

Resolve only the goal and sources the user explicitly supplied or confirmed. External specs, plans,
tasks, and reports may supplement implementation when current and consistent, but cannot replace a
change, override Specs or ADRs, prove completion, or contribute their Git, Agent, or workflow
instructions. Ask the user to select among ambiguous candidates; never choose the latest file.

Require one existing `ai-docs/engineering/changes/<change-id>/change.md` before dispatch. If the
input is a PRD, Story, task, issue, or product brief without a change, return control to the main
session to use the existing Product and Engineering planning capabilities. Do not invent or create
the missing product scope inside this Skill.

## Preflight

Read the change, optional design and plan, explicit sources, related ADRs, and path-selected Specs.
Confirm all pre-existing working-tree paths with the user. Build one in-session completion checklist;
do not persist it. Require a local or explicitly authorized internal non-production target.

Require Claude Code Agent Teams to be off and a user- or team-configured `playwright` MCP server to
be connected. If the required Playwright tools are unavailable, report `blocked`; never substitute
static tests for runtime acceptance.

## Run the loop

1. Dispatch `oec-implement` once with the change ID, completion checklist, and explicit reference
   paths. Retain the returned Agent ID.
2. Dispatch `oec-evaluate` once with the same inputs, the running target, changed paths, and observed
   command results. Retain that Agent ID.
3. On a runtime failure, forward the complete structured findings through the main session to the
   implementation Agent ID. Do not summarize them or forward the implementer's self-assessment to
   the evaluator.
4. Resume the same implementation Agent, then resume the same evaluation Agent. Every evaluation
   reruns the complete user journey and all applicable gates, not only the previous failure.
5. Stop early on scope expansion, product or architecture judgment, incomplete runtime evidence,
   repeated findings in two consecutive cycles, or two cycles without meaningful code changes.

Run at most five build-and-evaluate cycles by default. If the fifth cycle does not pass, stop and ask
whether to continue. An explicit continuation may run up to ten total cycles; never exceed ten.

After runtime evaluation passes, dispatch a fresh `oec-check`. Stop on judgment issues. If the check
changes code, resume `oec-evaluate` for a complete runtime recheck; if that fails and budget remains,
resume `oec-implement` again.

## Report

Report the change, explicit input paths, Agent statuses, cycle count, changed files, runtime evidence,
final check, unresolved findings, and stop reason. Do not create state files, snapshots, branches,
commits, closing artifacts, E3/Pipeline state, deployments, or remote Git changes. Harness pass is not
change closure; `closing-engineering-changes` remains a separate user action.
