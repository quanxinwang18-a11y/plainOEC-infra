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

## Initialize from codebase

When initializing team Specs from an existing repository, work through these layers before
proposing files:

1. **Package boundaries**: identify each independently buildable or deployable unit. What does
   each package own? What imports cross boundaries?
2. **Core abstractions**: which types, services, stores, commands, routes, or adapters define the
   system shape? Find the files that prove each pattern.
3. **Existing conventions**: discover patterns already consistently followed. Cite the source
   files that demonstrate them. A convention with no file evidence is not a convention.
4. **Decisions to preserve**: identify ADR-worthy choices already made (framework, database,
   architecture). Check existing ADRs before writing new ones.

For each discovered fact, confirm it with code, configuration, tests, or an accepted decision
before writing. Do not write a Spec for a module that has no stable conventions.

## Content standards

Every material claim in a Spec must be backed by at least one of:

- A source file that demonstrates the preferred pattern (cite the path).
- A test file that shows expected behavior.
- A project document that defines the convention.
- A repeated pattern across multiple files (cite two or more).

Anti-patterns and common mistakes must come from real code, old comments, or migration paths
found in the repository. Do not invent speculative pitfalls.

Avoid: placeholder prose (TODO, TBD, 待补充), generic framework advice, tool instructions
specific to one agent host, long copied code blocks, and rules based on a single accidental
implementation detail.

Before completing, scan for placeholder text and verify that every internal link target
exists. `oec-spec check` will catch these mechanically, but review content quality yourself.

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

Use `oec-spec legacy-audit --workspace "$PWD"` before proposing a legacy cleanup. Use
`oec-spec select --workspace "$PWD" --paths <relevant paths> --format json` to locate existing
path-scoped facts. After changing team knowledge, run `oec-spec check --workspace "$PWD"`; errors
block completion and warnings need a concise user-visible note.

Show the exact changed paths. Before a Git commit, obtain explicit confirmation and stage only
those paths with `git add -- <exact paths>` and
`git commit -m "docs(engineering): ..." -- <same exact paths>`.
