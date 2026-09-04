# Task artifact contract

The repository-level source of truth is `docs/architecture/oec-dev-contract-implementation-plan.md`.
This file is the installed-Plugin mirror for task artifact creation; when the two differ, update the
repository source first.

## Canonical locations

A Product-linked task uses:

```text
ai-docs/versions/vX.Y.Z/dev-task/<task-slug>/
├── README.md       # optional lightweight index
├── spec.md         # required
└── design.md       # required
```

An unversioned engineering change uses `ai-docs/Spec/changes/<change-id>/`. Existing legacy
`change.md` packages remain readable and are not renamed automatically.

## Required identity

`spec.md` frontmatter requires:

```yaml
artifact: task-spec
schema_version: 1
task_ref: versioned:v1.2.3/payment-retry
feature_name: paymentRetry
external_change_id: v1.2.3-paymentRetry
title: Payment retry
affected_paths:
  include:
    - services/payment/**
```

A versioned task must also contain a structured `source`; Product sources must provide `feature_name`.
Before `ready`, it has at least one `module_ids` entry. The body has `Goal and scope` and `Acceptance`
sections with at least one unique `AC-NNN` item.

`design.md` frontmatter requires:

```yaml
artifact: task-design
schema_version: 1
task_ref: versioned:v1.2.3/payment-retry
spec_ref: ./spec.md
title: Payment retry design
```

The body has `Constraints and affected contracts`, `Chosen design`, `Change boundary`, and
`Verification` sections. Add `Migration and rollback` only when it applies.

## Validation

Use the bundled, read-only runtime rather than duplicating path logic:

```bash
oec-spec task resolve --dev-root "$DEV_ROOT" --task-ref <taskRef> --format json
oec-spec task check --dev-root "$DEV_ROOT" --task-ref <taskRef> --stage structure --format json
oec-spec task check --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --stage ready --format json
```

Never write absolute machine paths into task documents. Product sources are read from `PRODUCT_ROOT`;
task documents are written only to `DEV_ROOT`.

## E3 requirement-to-repository mapping

When the user's natural-language starting point is an explicit E3 requirement or Story, keep the E3
identifier as external source evidence; it is not a local `taskRef`, even when it resembles `STORY-*`.
Use the existing read-only `get_e3_requirement_detail` or `get_e3_task_detail` tools after the current
workspace's user-confirmed product space is established. If the space is not bound, ask the user to
select it through the existing binding flow; never choose by title, directory name, latest object, or
identifier prefix. If the E3 ID or product space is absent/ambiguous, ask for it instead of searching. If E3 is
unavailable, accept a user-provided requirement/PRD as unverified local source and say what could not be checked.

Read only the current `DEV_ROOT`'s `CLAUDE.md`, relevant `ai-docs/Spec/` entries, task sources, and
paths selected by `oec-spec`. A second repository is eligible only after the user names its exact root
and the host authorizes it. Do not scan parent/sibling directories, `~/work`, Plugin Data history, or
other roots. For every candidate repository, report one of `required`, `possibly-related`,
`not-indicated`, or `unknown`, with concrete evidence, matched Specs and paths, and unresolved
assumptions. Do not use a numeric confidence threshold to select the set. The user must confirm the
repository set before task-pair writes; that confirmation does not authorize code edits or E3 writes.

## Cross-repository planning and handoff

After repository-set confirmation, run `code-plan` independently in each authorized root. Each root
keeps its own canonical `taskRef`, `spec.md`, `design.md`, Change Boundary, and Verification. Link the
same requirement/PRD identity, revision, original goal, and any real cross-repository API/message/data
contract in each task's source or Design without copying Product documents. Prompt the developer to
manually keep provider/consumer descriptions, compatibility, order, rollback, and independent checks
consistent; do not synchronize files or write another root from the current session. Report
`completed`, `partial`, `blocked`, and `unresolved` repositories separately, and never describe a
partial set as the whole requirement being complete.

`code-plan` and `code-finish` do not invoke E3 create/progress automatically. A later E3 handoff must
be separately requested and reuse `prepare → explicit Human confirmation → execute → status/read-back`.
