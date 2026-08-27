# Legacy ai-docs artifact mapping

Use this reference only for an explicitly requested legacy migration. Migration is additive: legacy
files stay in place while verified knowledge is represented in the current engineering contract.

## Classification

| Source statement | Required evidence | Target |
|---|---|---|
| Current responsibility, interface, invariant, failure mode, or verified command | Current code, configuration, tests, or maintained contract | `ai-docs/engineering/specs/**/*.md` |
| Accepted decision that still constrains future work | Original decision plus current confirmation that it remains effective | `ai-docs/engineering/decisions/ADR-NNNN-<slug>.md` |
| Active high-risk change context | Current work plus an observable goal, boundary, and risk | `ai-docs/engineering/changes/<change-id>/` |
| Historical delivery, review, release, test, or debugging record | None; retain for traceability | Leave at its source path |
| Workflow stage, router state, generated score, placeholder, or obsolete process | Not eligible | Leave at its source path; do not index as current knowledge |

Do not use a legacy document as its own proof of current behavior when code, configuration, or tests
can verify the claim. Cite the evidence paths in the target artifact.

## Product and design artifacts

| Legacy path | Action |
|---|---|
| `ai-docs/prd/prd-all.md` and changelog | Preserve as Product SSOT and history; do not copy into Engineering |
| `ai-docs/versions/v*/prd/` | Preserve version increments, child PRDs, and `HANDOFF.yaml` in place |
| `ai-docs/versions/v*/subprd-review-*.md` | Retain as historical review output; current PRD review is not a persisted Engineering artifact |
| `ai-docs/ui/` and version prototypes or design links | Preserve as design assets; migrate only an engineering invariant proven by current implementation |

Legacy and current HANDOFF files may share `schema_version: 4` while containing different optional
fields. Preserve legacy fields and validate consumers before any separately authorized rewrite.

## Architecture and API artifacts

For `ai-docs/architecture/` and `ai-docs/apis/`:

- Extract current path-scoped responsibilities and invariants into focused Specs.
- Convert a still-effective accepted decision into an ADR without rewriting its decision.
- Put unresolved or merely proposed choices into an active change context, not an accepted ADR.
- Keep version decision records, option analyses, deltas, and final reports as history after extracting
  any current evidence-backed knowledge.
- Keep maintained OpenAPI or other machine-readable contracts at their canonical paths. Specs link to
  those contracts rather than duplicating them.
- Ignore empty seeded files and placeholder-only templates.

Avoid one giant `SPEC-architecture` that mirrors every legacy document. Split only when path
selection, ownership, or a distinct invariant benefits.

## Development task packages

| Legacy task artifact | Current treatment |
|---|---|
| `README.md` or `spec.md` | Active goal, scope, source PRD, acceptance, and risk may enter `change.md`; stable facts enter Specs |
| `design.md` or `spec-delta.md` | Active material tradeoffs may enter `design.md`; durable accepted choices may enter ADRs |
| `tasks.md` | Do not migrate by default; routine task decomposition belongs to the current coding session |
| `implementation-plan.md` | Use `plan.md` only when ordering, coordination, rollback, or high-risk verification must remain durable |
| `verification.md` | Copy only commands and results actually observed for the active change into `evidence.md` |
| `debug-notes.md` | Proven lasting facts may enter a Spec; unresolved residual risk may enter active change evidence |
| `code-review/*.md` | Do not migrate scores or generic comments; carry forward only unresolved material defects in active context |
| `sync-status.md` or `dev-state.yaml` | No current Engineering equivalent; preserve as workflow history |

Never infer the current development phase from file presence. Current Engineering has no replacement
for the legacy Dev state machine.

## Release and test artifacts

- Preserve release notes, changelogs, reports, screenshots, and generated evidence as history.
- Extract only currently valid deployment, testing, data, or operational invariants into the relevant
  path-scoped Spec.
- Put real final-diff verification for an active change in `evidence.md`.
- Do not recreate the legacy fixed release-document set or test dispatcher state.

## E3 and managed configuration

`ai-docs/integrations/e3/v*.yaml` remains at its source path. Legacy PRD mapping adoption belongs to
the explicit Product publishing capability and the E3 MCP server because remote identity must be
verified. Legacy `dev-state.yaml` must not be converted manually into a development mapping.

`.oec-ai`, project Skills, Agents, hooks, and host configuration are not `ai-docs` knowledge. Audit
them read-only, but treat cleanup as a later, separately confirmed destructive operation.

## Migration completion

A migration is complete when:

- every new current-state claim has repository evidence;
- accepted ADRs preserve the original decision meaning;
- only justified active changes have persistent change packages;
- `oec-spec check` succeeds;
- the user can see which legacy files stayed unchanged;
- no E3, cleanup, deletion, deployment, or unrelated code change was included.
