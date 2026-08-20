---
name: writing-prds
description: Creates, revises, and finalizes versioned PRDs, then splits them into child PRDs and HANDOFF artifacts. Use when the user asks to write a PRD, create or change a requirement, generate a version PRD, or merge an external child requirement into the product SSOT.
argument-hint: "[requirement, PRD path, or version]"
---

# Writing PRDs

Produce product-facing requirements from the user's facts and decisions. Preserve uncertainty
as a pending decision; do not invent values to make a document look complete.

## Work with the correct artifact

- A new feature or changed business rule creates or updates a version increment PRD.
- A wording correction or clarification that does not change behavior amends the root PRD and
  changelog without creating a version.
- One `## 模块:` block becomes one sibling child PRD. A one-module version still has one child.
- Generate `HANDOFF.yaml` from the increment PRD; do not derive new product content during split.
- Adjust split granularity in the increment PRD, then regenerate children and HANDOFF.

Use [references/artifact-contract.md](references/artifact-contract.md) for paths, invariants,
finalization, split, and commit rules. Use [references/versioning.md](references/versioning.md)
only when deciding whether a change creates a version. Use
[references/product-language.md](references/product-language.md) when translating technical
input into observable product behavior.

Use `assets/root-prd.md` and `assets/root-prd-changelog.md` when initializing the product SSOT.
Use the remaining templates in [assets/](assets/) for version increments, child PRDs, and HANDOFF.
Adapt conditional sections to the requirement. Do not emit empty conditional sections or
placeholder values.

Before presenting an artifact as complete, run:

```bash
node "${CLAUDE_SKILL_DIR}/runtime/check-artifacts.mjs" --workspace "$PWD" --version <vX.Y.Z> --stage pre-publish
```

Use `--stage finalize` before HANDOFF exists. Errors block completion; warnings require a concise
user-visible note. Show the exact changed files and summary before asking for commit confirmation.
