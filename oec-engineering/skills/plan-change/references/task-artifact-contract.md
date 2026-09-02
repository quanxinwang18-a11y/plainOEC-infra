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

An unversioned engineering change uses `ai-docs/engineering/changes/<change-id>/`. Existing legacy
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
