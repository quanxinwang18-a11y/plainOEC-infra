---
name: managing-team-specs
description: Creates, migrates, or updates durable project engineering Specs and ADRs when the user asks to initialize team knowledge, document current architecture, reconcile documentation with code, or preserve an engineering decision. Do not use for ordinary implementation plans, transient task notes, or product requirements.
argument-hint: "[init, update, migrate, or engineering topic]"
---

# Managing team Specs

Maintain project-owned engineering facts under `ai-docs/engineering/`. Treat code, configuration,
tests, existing documentation, and explicit user decisions as evidence; do not invent conventions
to make a template look complete.

Before writing, inspect the relevant repository evidence and show the exact files you propose to
create or update. Proceed after the user confirms that file plan. Create only documents supported
by real facts; an absent category is better than an empty placeholder.

Use [references/team-spec-contract.md](references/team-spec-contract.md) for paths, frontmatter,
current-state and change-package boundaries, ADR rules, host pointers, and Git handling. Use only
the templates needed for the requested documents:

- [assets/engineering-index.md](assets/engineering-index.md) for the team knowledge index.
- [assets/team-spec.md](assets/team-spec.md) for a current-state Spec.
- [assets/adr.md](assets/adr.md) for a durable engineering decision.
- [assets/change.md](assets/change.md) for non-trivial change context.
- `assets/design.md`, `assets/plan.md`, and `assets/evidence.md` only when their conditions hold.

When migrating legacy material, preserve existing `ai-docs` files in place. Classify each source
statement as current fact, durable decision, historical change context, or obsolete process before
copying it. Never migrate workflow stages, routing tables, generated scores, or unverified claims
into a current-state Spec.

After updating team knowledge, show the exact changed paths. Before a Git commit, obtain explicit
confirmation and stage only those paths with `git add -- <exact paths>` and
`git commit -m "docs(engineering): ..." -- <same exact paths>`.
