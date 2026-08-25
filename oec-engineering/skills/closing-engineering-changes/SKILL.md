---
name: closing-engineering-changes
description: Finalizes a completed code change by checking real verification evidence, reconciling durable team Specs or ADRs, recording residual risk, and optionally committing exact files. Use only when the user explicitly asks to close or finish engineering work. Do not use to deploy, update E3, implement unfinished code, or force documentation onto a small fix.
argument-hint: "[change ID or completed change]"
disable-model-invocation: true
---

# Closing engineering changes

Close only the change the user identifies. Inspect the actual diff and working tree before deciding
what belongs to it; preserve unrelated user changes and never broaden the commit boundary for
convenience.

## Establish evidence

Identify the validation commands relevant to the changed behavior from repository configuration and
path-scoped team Specs. Run safe, targeted checks that have not already produced trustworthy current
results. Report failures and unexecuted checks honestly; an Agent statement is not test evidence.

If the change has a persisted directory under `ai-docs/engineering/changes/<change-id>/`, record
only observed commands, results, environment limits, and residual risk in `evidence.md`. Adapt
[assets/evidence.md](assets/evidence.md); do not add an evidence file to an ordinary small fix merely
to satisfy this Skill.

## Reconcile durable knowledge

Before reconciling, confirm that key verification has happened against the final diff:

- Run the project's test command if tests have not already produced trustworthy current results.
- If the change touches a Spec's responsibility, verify the implementation matches the Spec's
  invariants.
- If the user explicitly invoked TDD or code-review earlier, confirm those results are still valid
  against the final diff.

A change is not closed until the final diff has a review appropriate to its risk. A main-session
self-review is sufficient for a small, local change without a persisted change package. For a
persisted change package that crosses modules or changes a public interface, data, compatibility,
or migration behavior, ask the user to dispatch the `oec-check` subagent with the change ID for a
fresh-context review. If the user declines, record that explicit waiver and the residual review risk
in `evidence.md`. Here, independent means isolated from the implementation context; it does not imply
a different model, organization, permission boundary, or security sandbox.

Run `oec-spec select --workspace "$PWD" --paths <changed paths> --format json`. Compare the selected
Specs and accepted ADRs with the implemented behavior:

- Update a Spec only when a stable responsibility, interface, invariant, failure mode, or verified
  command changed.
- Add an ADR only when a durable technical choice will constrain later work.
- Leave team knowledge unchanged when the diff is an internal implementation detail or restores
  already-documented behavior.
- Never copy transient implementation steps, review commentary, or speculative future work into a
  current-state Spec.

Run `oec-spec check --workspace "$PWD"` after any engineering-document change. Contract errors block
closure. Warnings and residual risks must remain visible.

## Present and commit

Summarize:

- behavior changed and acceptance evidence;
- checks passed, failed, and not run;
- team Specs, ADRs, or evidence changed, or why none were needed;
- the exact code and documentation paths proposed for the change commit;
- unrelated working-tree paths that will remain untouched.

Only after explicit confirmation, stage the exact proposed files:

```bash
git add -- <exact code and engineering-document paths>
git commit -m "<focused message>" -- <same exact paths>
```

Do not use `git add -A`, include product PRDs without separate authorization, rewrite history,
deploy, create releases, or write E3, SAE, UTP, Git hosting, or Feishu state. A failed or materially
incomplete verification cannot be reported as closed.
