---
name: close-change
description: Finalizes a completed code change by checking real verification evidence, validating an optional taskRef, reconciling durable team Specs or ADRs, recording residual risk, and optionally committing exact files. Use when the user asks to close or finish engineering work. Do not use merely to report test results, deploy, update E3, implement unfinished code, or force documentation onto a small fix.
argument-hint: "[taskRef, change ID, or completed change]"
---

# Close change

Close only the change the user identifies. Preserve unrelated user changes and never broaden the
commit boundary for convenience.

## Establish context and evidence

1. Run `git status --short` and inspect the complete diff, including untracked files.
2. If a taskRef is supplied, resolve and validate it once through the bundled task checker. Its
   result includes the canonical task object:

```bash
oec-spec task check --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --stage close --format json
```

3. Run fresh, relevant tests, typecheck, lint, and any runtime checks named by the task Design or
   repository Specs. Report passed, failed, and unexecuted checks honestly. A failed or incomplete
   verification cannot be reported as closed.
4. Run `oec-spec select --workspace "$DEV_ROOT" --paths <changed paths> --format json` and compare
   selected Specs and accepted ADRs with the final behavior.
5. Run the read-only freshness check:

```bash
oec-spec remind --workspace "$DEV_ROOT" --paths <changed paths> \
  [--task-ref <taskRef>] --signals <observed signals> --format json
```

Present reminder candidates as suggestions. Do not update a Team Spec or ADR without explicit user
confirmation.

## Reconcile durable knowledge

Update a current-state Spec only when a stable responsibility, interface, invariant, failure mode, or
verified command changed. Add an ADR only when a durable choice constrains later work. Leave knowledge
unchanged for internal implementation details or already documented behavior.

For a versioned task, keep `spec.md` and `design.md` at:

```text
ai-docs/versions/vX.Y.Z/dev-task/<task-slug>/
```

For an unversioned change, keep the existing `ai-docs/engineering/changes/<change-id>/` contract.
Do not create a second copy of the task documents. Write `verification.md` only when the task profile
or user requires persisted evidence.

## Present and commit

Summarize behavior, acceptance evidence, checks, reminder candidates, durable documents changed (or
why none were needed), residual risk, exact code and engineering-document paths, and unrelated paths
that remain untouched.

Invoking this Skill does not authorize a commit. Only after explicit confirmation, stage the exact proposed files:

```bash
git add -- <exact code and engineering-document paths>
git commit -m "<focused message>" -- <same exact paths>
```

Do not use `git add -A`, include Product PRDs without separate authorization, rewrite history, deploy,
or write E3, Pipeline, SAE, UTP, or remote Git state.
