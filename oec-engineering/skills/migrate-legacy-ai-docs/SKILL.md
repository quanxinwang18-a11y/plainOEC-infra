---
name: migrate-legacy-ai-docs
description: Migrates verified engineering facts and accepted decisions from legacy OEC ai-docs into current team Specs, ADRs, and active change packages. Use only when the user explicitly invokes this Skill for a legacy repository migration. Do not use for ordinary Spec maintenance, Product PRDs, E3 mapping adoption, or deletion of legacy files and managed configuration.
argument-hint: "[workspace or migration scope]"
disable-model-invocation: true
---

# Migrate legacy ai-docs

Migrate knowledge, not directory trees. Preserve every existing `ai-docs` file in place and create
or update only the current engineering artifacts that the user approves under
`ai-docs/engineering/`.

Read [references/legacy-artifact-mapping.md](references/legacy-artifact-mapping.md) before
classifying legacy files. Use the team artifact rules in
`../manage-specs/references/team-spec-contract.md` for every target Spec, ADR, or change
package.

## Migration boundary

- Current facts require evidence from code, configuration, tests, maintained contracts, or an
  explicit current user decision.
- Accepted decisions that still constrain future work may become ADRs without changing their
  meaning.
- Only an active cross-module, interface, data, compatibility, migration, or high-risk change may
  become a change package.
- Historical workflow state, routing, generated scores, placeholders, and unverified claims remain
  history and do not become current Specs.
- Product PRDs, UI assets, release records, test reports, and legacy files remain at their existing
  paths unless the user separately requests another scoped operation.

Do not adopt E3 mappings, write external systems, remove `.oec-ai`, `.claude`, or `.codex`, or delete
or move legacy `ai-docs` in this Skill. Those actions have separate ownership and authorization
boundaries.

## Workflow

1. Run `oec-spec legacy-audit --workspace "$PWD"` and enumerate the existing `ai-docs` files without
   modifying them.
2. Inspect relevant repository evidence. Classify each candidate statement as current fact, durable
   decision, active change context, historical context, or obsolete process.
3. Present an exact migration plan containing each source path, proposed target path, classification,
   and supporting evidence. Include files that will remain unchanged. Versioned `dev-task` packages
   remain at their canonical paths; only their verified facts or an explicitly approved upgrade may be
   represented elsewhere. Wait for user confirmation.
4. Create or update only the confirmed files under `ai-docs/engineering/`. Link source PRDs and
   maintained contracts instead of copying them. Do not flatten or duplicate task Spec/Design files.
5. Run `oec-spec check --workspace "$PWD"`. Errors block completion; warnings require a concise
   user-visible explanation.
6. Show the exact changed paths and what was intentionally left in place. Before committing, obtain
   explicit confirmation and stage only those paths with `git add -- <exact paths>` and
   `git commit -m "docs(engineering): migrate verified legacy knowledge" -- <same exact paths>`.

Finish after the validated migration commit or after reporting why no evidence-backed target files
were warranted. Do not create a migration state file, archive, cleanup commit, or automatic follow-up.
