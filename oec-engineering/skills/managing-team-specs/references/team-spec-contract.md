# Team Spec contract

## Ownership and paths

All files are owned by the product repository, not by the installed plugin:

```text
ai-docs/engineering/
├── README.md
├── specs/
│   └── **/*.md
├── decisions/
│   └── ADR-NNNN-<slug>.md
└── changes/
    └── <change-id>/
        ├── change.md
        ├── design.md       # conditional
        ├── plan.md         # conditional
        └── evidence.md
```

`README.md` is a concise index. `specs/` describes the system as it is now. `decisions/` explains
durable choices. `changes/` records bounded context and evidence for non-trivial changes.

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
- Use `**` only for facts that apply to the entire repository.
- Absolute paths, backslashes, `.` segments, and `..` segments are invalid.
- A Spec states verified responsibilities, interfaces, invariants, failure modes, or commands. It
  does not prescribe a universal development workflow.

Prefer a module Spec when rules apply to a distinct path. Split a file only when doing so improves
path selection or ownership; do not mirror every source directory.

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
do not rewrite its decision. Record a changed decision in a new ADR, list the old ID in
`supersedes`, and change only the old ADR status and superseding link.

Create an ADR only when the choice will constrain later work. Local implementation detail and
obvious framework use do not require one.

## Change packages

Persist a change package only for cross-module work, public interface or data changes,
compatibility/migration work, or another change whose risk justifies durable context.

`change.md` is required for a persisted package and its `id` must equal its directory name:

```yaml
---
id: v1.2.3-payment
related_specs:
  - SPEC-payment-domain
related_adrs: []
source_prd: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-payment.md
source_stories:
  - US-001
---
```

Only `id` is universally required. Omit an optional key when it has no real value; do not write an
empty placeholder. Product-linked IDs use `vX.Y.Z-<featureName>`. Unversioned technical work uses
`YYYY-MM-DD-<slug>`.

- Add `design.md` only when interface, data, architecture, migration, or other material tradeoffs
  need explanation.
- Add `plan.md` only when ordering, coordination, rollback, or high-risk verification needs to be
  durable.
- Add `evidence.md` only after recording commands and results actually observed for this change.
- Link product requirements rather than copying them into engineering documents.

## Project host pointers

After user confirmation, a repository may include this bounded block in both root `CLAUDE.md` and
`AGENTS.md`:

```markdown
<!-- oec-engineering:start -->
## Engineering context

- Team engineering facts are indexed at `ai-docs/engineering/README.md`.
- Before changing code, consult only the Specs and ADRs relevant to the paths being changed.
- Use the repository's verified build, test, and validation commands.
<!-- oec-engineering:end -->
```

Merge this block without replacing unrelated instructions. If one host file is intentionally absent,
do not create it merely for symmetry unless the user asks for that host.

## Git boundary

Show the exact team-knowledge files before requesting commit confirmation. Stage only confirmed
paths:

```bash
git add -- <exact team Spec, ADR, or change paths>
git commit -m "docs(engineering): ..." -- <same exact paths>
```

Never stage code, product PRDs, credentials, legacy managed configuration, or unrelated changes as
part of a team Spec commit.
