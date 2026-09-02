---
name: change-plan
description: Required first planning step for a non-trivial implementation request sourced from a PRD, Story, HANDOFF, issue, or other change; produces the smallest task-level Spec and Design. It records technical design without forcing an implementation plan. Do not use for ordinary implementation, a small obvious fix, product PRD authoring, or external task creation.
argument-hint: "[taskRef, PRD, HANDOFF, issue, or technical change]"
---

# Plan change

This Skill prepares the smallest useful task context. It is the planning gate before business-code
edits when a non-trivial implementation request is sourced from a PRD, Story, HANDOFF, issue, or
other change document. A PRD-only implementation request is not an existing ready task: do not start
coding until this Skill has produced a valid task pair and the user has confirmed the file plan.

It does not become a general coding router or impose a fixed implementation sequence. Ordinary small
coding remains in the Main Session.

## Resolve context

1. Establish `DEV_ROOT` and, when Product files are separate, `PRODUCT_ROOT`. Do not guess among
   multiple roots.
2. Resolve the supplied identity through the bundled runtime; do not construct paths locally:

```bash
oec-spec task resolve --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --allow-missing --format json
```

3. For a Product task, read the PRD/Child PRD and `HANDOFF.yaml` from Product Root (`PRODUCT_ROOT`) only. Record
   repository, revision, relative paths, featureName, and Story IDs; never copy the Product document.
4. Run `oec-spec select --workspace "$DEV_ROOT" --paths <affected paths> --format json` and read the
   returned Specs and accepted ADRs. If `ai-docs/Spec` does not exist, selection is an empty-context
   warning, not a planning blocker; continue using repository evidence and the PRD. Do not invoke
   `spec-manage` unless the user explicitly asks to initialize durable Team Specs.

Read [references/task-artifact-contract.md](references/task-artifact-contract.md) and use the
provided assets. If identity, source, module, or acceptance meaning is ambiguous, ask only the
question that changes the boundary. Do not silently invent a task slug or source root.

## Write the task pair

Show the resolved roots, canonical `taskRef`, source, module paths, and exact files before writing.
For a versioned task the required files are:

```text
ai-docs/versions/vX.Y.Z/dev-task/<task-slug>/spec.md
ai-docs/versions/vX.Y.Z/dev-task/<task-slug>/design.md
```

For an unversioned `change:<change-id>`, preserve the existing `ai-docs/Spec/changes/<change-id>/`
contract; do not create a parallel versioned directory. New managed unversioned packages may use the same
paired task files only when the user explicitly chooses that profile.

After the user confirms the file plan, write both documents when the inputs are clear. If a material
question remains, write/update `spec.md` first and wait before writing `design.md`; this is an adaptive
judgment, not a universal stage gate.

`spec.md` records goal, scope, affected modules/paths, source provenance, and observable `AC-NNN`
acceptance items. `design.md` records only applicable constraints, the chosen implementation design,
change boundary, and verification. Do not force API, database, deployment, or plan sections that do
not apply.

Validate after writing:

```bash
oec-spec task check --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --stage ready --format json
```

A failed check is visible and blocks a ready claim. At this checkpoint, run the read-only freshness
check and report its candidates:

```bash
oec-spec remind --workspace "$DEV_ROOT" --paths <affected paths> \
  --task-ref <taskRef> --format json
```

Do not implement code, create E3 tasks, update Team Specs, or commit as part of this Skill. Reminders
never write documents. When the original request was to implement the PRD-backed task, a successful
ready check hands control back to the main session to invoke `change-implement`; do not make the user
repeat the implementation request.
