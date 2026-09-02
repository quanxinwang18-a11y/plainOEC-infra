---
name: spec-manage
description: Creates or updates durable project engineering Specs and ADRs, or reports possible stale Specs, when the user explicitly asks to initialize team knowledge, document current architecture, reconcile documentation with code, preserve a decision, or remind on a completed change. Do not use for task Spec/Design authoring, ordinary implementation plans, legacy migration, or product requirements.
argument-hint: "[remind, init, update, or engineering topic]"
---

# Manage Specs

This Skill owns repository-maintained current engineering facts and durable decisions. It does not own
one-time task `spec.md`/`design.md`; those belong to `change-plan`. The repository fact source for the
OEC Dev contract is `docs/architecture/oec-dev-contract-implementation-plan.md`.

## Read-only reminder

For `remind`, inspect the requested diff or paths and run:

```bash
oec-spec remind --workspace "$DEV_ROOT" --paths <changed paths> \
  [--task-ref <taskRef>] --format json
```

Report candidates as advisory possibilities, not as proof that a Spec is stale. Do not write files,
create state, or block ordinary coding in reminder mode. `change-plan`, `code-review`, and
`change-close` may run this read-only check at their natural checkpoints.

## Initialize or update

Before writing, establish the exact Dev Root and inspect code, configuration, tests, maintained
contracts, existing Specs, and ADRs. For each material claim, retain evidence from a source file,
test, maintained document, or repeated pattern. Prefer a module-scoped Spec when it improves context
selection; do not mirror every source directory.

Show the exact files you propose to create or update and wait for user confirmation. Create only
supported documents; an absent category is better than an empty placeholder.

Use [references/team-spec-contract.md](references/team-spec-contract.md) for paths, frontmatter,
current-state and change-package boundaries, ADR rules, host pointers, and Git handling. Use only the
needed assets:

- `assets/engineering-index.md` for the knowledge index;
- `assets/module-index.yaml` only when stable module metadata is needed;
- `assets/team-spec.md` for a current-state Spec;
- `assets/adr.md` for a durable decision;
- `assets/change.md` for non-trivial unversioned change context;
- `assets/design.md`, `assets/plan.md`, and `assets/evidence.md` only when their conditions hold.

After changing team knowledge, run:

```bash
oec-spec check --workspace "$DEV_ROOT"
```

Errors block completion; warnings and reminder candidates must be shown to the user. Before a Git
commit, obtain explicit confirmation and stage only the exact confirmed engineering-document paths.
