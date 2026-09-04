---
name: code-plan
description: Use as the first planning step for non-trivial work from a PRD, Story, HANDOFF, explicit E3 requirement/Story, issue, or other requirement; establish confirmed scope, acceptance, technical direction, and a safe code boundary without requiring the user to know internal task documents. Do not use for ordinary implementation, small obvious fixes, product authoring, or external task creation.
argument-hint: "[taskRef, PRD, HANDOFF, E3 requirement/Story, issue, or technical change]"
---

# Plan code

This Skill prepares the smallest useful task context. It is the planning gate before business-code edits when a non-trivial implementation request is sourced from a PRD, Story, HANDOFF, issue, or other change document. A PRD-only implementation request is not an existing ready task: do not start coding until this Skill has produced a valid task pair and the user has confirmed the file plan.

It does not become a general coding router or impose a fixed implementation sequence. Ordinary small coding remains in the Main Session. For an E3 requirement/Story starting point, use the mapping guidance below before creating a local task pair.

## Resolve context

1. Establish `DEV_ROOT` and, when Product files are separate, `PRODUCT_ROOT`; do not guess among multiple roots.
2. If a local task identity is supplied, resolve it through the bundled runtime; for an explicit E3 requirement/Story
   with no local taskRef, map it first and resolve local identity only after repository confirmation:
```bash
oec-spec task resolve --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --allow-missing --format json
```
3. For a Product task, read the PRD/Child PRD and `HANDOFF.yaml` from Product Root (`PRODUCT_ROOT`) only; record repository, revision, relative paths, featureName, and Story IDs without copying the Product document. When the PRD is in the same repository, explicitly use it as both `DEV_ROOT` and `PRODUCT_ROOT`; do not emit `source.kind: none` for a PRD-backed task.
4. Run `oec-spec select --workspace "$DEV_ROOT" --paths <affected paths> --format json` and read the
   returned Specs and accepted ADRs. If `ai-docs/Spec` does not exist, selection is an empty-context
   warning, not a planning blocker; continue using repository evidence and the PRD. Do not invoke
   `knowledge-manage` unless the user explicitly asks to initialize durable Team Specs.

Read [references/task-artifact-contract.md](references/task-artifact-contract.md) and use the
provided assets. If identity, source, module, or acceptance meaning is ambiguous, ask only the
question that changes the boundary. Do not silently invent a task slug or source root.

## Map an explicit E3 requirement or Story

Use the current workspace's user-confirmed E3 space and the read-only `get_e3_requirement_detail` or `get_e3_task_detail` tools. Keep an E3 ID such as `STORY-*` as source evidence, never as a guessed
local `taskRef`; resolve local identity separately. If the E3 ID or product space is absent/ambiguous, ask for it
instead of searching. Read the current DEV_ROOT `CLAUDE.md`, selected
Specs, and task sources only. Read another repository only after the user provides its exact path and
the host authorizes that root. Show `required`, `possibly-related`, `not-indicated`, or `unknown` for
each candidate with evidence, matched Specs/paths, and unresolved assumptions; for interfaces spanning roots,
remind each Design to keep provider/consumer details consistent manually. Do not use numeric
confidence to select repositories. Obtain confirmation of the repository set before writing any task
pair; then plan each authorized root separately with its own canonical taskRef and task pair, reporting `completed`,
`partial`, `blocked`, and `unresolved` repositories. This does not authorize code edits, cross-root writes, or E3
creation. If E3 is unavailable, continue only with clearly labeled user-provided/unverified requirement evidence.

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

A failed check is visible and blocks a ready claim. Return the original user goal, canonical taskRef,
confirmed Change Boundary, exact artifact paths, ready-check result, unresolved decisions, and the
suggested next action so the Main Session can continue without making the user route the work.

At this checkpoint, run the read-only freshness check and report its candidates:
```bash
oec-spec remind --workspace "$DEV_ROOT" --paths <affected paths> \
  --task-ref <taskRef> --format json
```

Do not implement code, create E3 tasks, update Team Specs, or commit as part of this Skill. Reminders never write
documents. When the original request was to implement the PRD-backed task, a successful ready check hands control
back to the main session to invoke `code-implement`; do not make the user repeat the implementation request.
