# Team Spec contract

The repository-level source of truth for the wider OEC Dev contract is
`docs/architecture/oec-dev-contract-implementation-plan.md`. This file is the installed-Plugin
contract for durable team knowledge and must remain consistent with it.

## Ownership and paths

All files are owned by the product or development repository, not by the installed plugin:

```text
ai-docs/Spec/
├── README.md
├── module-index.yaml       # optional stable module metadata
├── specs/
│   └── **/*.md
├── decisions/
│   └── ADR-NNNN-<slug>.md
└── changes/
    └── <change-id>/
        ├── change.md        # legacy/current unversioned context
        ├── design.md        # conditional
        ├── plan.md          # conditional
        ├── research/        # conditional; bounded Agent research
        └── evidence.md      # conditional; observed verification only
```

Product-linked task artifacts have a separate canonical location:

```text
ai-docs/versions/<version>/dev-task/<task-slug>/
├── README.md                # optional lightweight index
├── spec.md                  # required for a new Managed Task
├── design.md                # required for a new Managed Task
└── <optional task artifacts>
```

`README.md` is a concise index. `module-index.yaml` contains only stable module identity and routing
metadata. `specs/` describes the system as it is now. `decisions/` explains durable choices.
`changes/` records bounded context and evidence for non-trivial unversioned work. Versioned task
`spec.md` and `design.md` describe one change and must not be copied into current-state Specs.

Do not create empty category files. Common names such as `architecture.md`, `domain.md`,
`interfaces.md`, `data.md`, `testing.md`, and `delivery.md` are options, not a required set.

## Current-state Specs

Every file below `specs/` starts with:

```yaml
---
id: SPEC-payment-domain
applies_to:
  - services/payment/**
---
```

- `id` matches `SPEC-[a-z0-9][a-z0-9-]*` and is unique in the repository.
- `applies_to` is a non-empty list of POSIX-style repository-relative globs.
- `module_id` is optional and uses a stable lower-kebab-case module identity.
- Use `**` only for facts that apply to the entire repository.
- Absolute paths, backslashes, `.`, and `..` segments are invalid.
- A Spec states verified responsibilities, interfaces, invariants, failure modes, or commands. It
  does not prescribe a universal development workflow.

Prefer a module Spec when rules apply to a distinct path. Split a file only when doing so improves
path selection or ownership; do not mirror every source directory.

## Optional module index

When a repository needs stable module ownership or dependency metadata, `module-index.yaml` may use:

```yaml
schema_version: 1
modules:
  - id: payment
    title: Payment
    owner: payment-team
    specs:
      - SPEC-payment-domain
    depends_on:
      - order
```

The index is optional. Path-scoped `applies_to` remains sufficient for Spec selection. Validate unique
module IDs, valid references, and repository-relative globs when the index exists.

## ADRs

ADR filenames and IDs use the next unused four-digit number:

```yaml
---
id: ADR-0001
status: accepted
date: 2026-08-20
supersedes: []
---
```

Allowed status values are `accepted` and `superseded`. An accepted ADR body is historical evidence:
do not rewrite its decision. Record a changed decision in a new ADR, list the old ID in `supersedes`,
and change only the old ADR status and superseding link.

Create an ADR only when the choice will constrain later work. Local implementation detail and
obvious framework use do not require one.

## Versioned task artifacts

A new Product-linked Managed Task uses the normalized reference:

```text
versioned:v1.2.3/payment-retry
```

and requires `spec.md` plus `design.md` under the matching versioned `dev-task` directory. Their
`task_ref` values, version, slug, source, module IDs, and internal references must be consistent.
Use `oec-spec task check --stage structure|ready|close` for deterministic validation.

Existing `change.md` packages and old task directories remain readable in legacy mode. Do not rename,
copy, or flatten them automatically. A legacy package must be explicitly upgraded before it can claim
new Managed Task readiness.

## Change packages

Persist an unversioned change package only for cross-module work, public interface or data changes,
compatibility/migration work, or another change whose risk justifies durable context.

`change.md` is required for a new legacy-compatible unversioned package and its `id` must equal its
directory name. Product-linked versioned tasks use `spec.md`/`design.md` instead. Add `design.md` only
when interface, data, architecture, migration, or other material tradeoffs need explanation.
Add `plan.md` only when ordering, coordination, rollback, or high-risk verification needs to be durable.
Add `research/` only when bounded research for this existing change must persist across sessions.
Add `evidence.md` only when the conditional change contract needs commands and results actually observed
for this change.

Link product requirements rather than copying them into engineering documents.

## Product and Dev roots

Product Root is read-only and task artifacts are written only to DEV_ROOT. Product PRDs and HANDOFF files
are read from `PRODUCT_ROOT`; task and engineering artifacts are written to `DEV_ROOT`. When the roots differ, never write Product files or use absolute machine paths in a
source reference. Record the Product repository, revision, and repository-relative PRD/HANDOFF paths.

## Project host pointers

After user confirmation, a repository may include this bounded block in both root `CLAUDE.md` and
`AGENTS.md`:

```markdown
<!-- oec-dev:start -->
## Engineering context

- Team engineering facts are indexed at `ai-docs/Spec/README.md`.
- Before changing code, consult only the Specs and ADRs relevant to the paths being changed.
- Use the repository's verified build, test, and validation commands.
<!-- oec-dev:end -->
```

Merge this block without replacing unrelated instructions. If one host file is intentionally absent,
do not create it merely for symmetry unless the user asks for that host.

## Git boundary

Show the exact team-knowledge files before requesting commit confirmation. Stage only confirmed paths:

```bash
git add -- <exact team Spec, ADR, or change paths>
git commit -m "docs(engineering): ..." -- <same exact paths>
```

Never stage code, product PRDs, credentials, legacy managed configuration, or unrelated changes as
part of a team Spec commit.
