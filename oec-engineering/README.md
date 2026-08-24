# oec-engineering

`oec-engineering` provides focused software engineering Skills and a project-owned team Spec
contract. It does not replace Claude Code's main coding agent or install a development state
machine.

## Install

Add the Git Marketplace once, then install the engineering Plugin:

```bash
claude plugin marketplace add \
  quanxinwang18-a11y/plainOEC-infra \
  --scope user

claude plugin install \
  oec-engineering@plainOEC-infra \
  --scope user
```

This does not require `npm login`, `npm install`, GitHub Packages, or a manually created `.claude`
directory. The committed runtime bundle requires Node.js 20 or newer on `PATH`.

Use project scope only when the team wants Claude Code to commit the Marketplace and enablement
declaration for the repository. The CLI owns that settings file; do not hand-write Plugin payloads
into the project.

## Capabilities

### Skills

```text
/oec-engineering:managing-team-specs
/oec-engineering:planning-engineering-changes
/oec-engineering:test-driven-development
/oec-engineering:diagnosing-failures
/oec-engineering:reviewing-code-changes
/oec-engineering:closing-engineering-changes
```

### Agents

```text
/oec-engineering:oec-implement   (isolated implementation)
/oec-engineering:oec-check       (fresh-eyes review)
/oec-engineering:oec-research    (background research)
```

Agents are optional — implementation, review, and research can also be done in the main
session. TDD applies only when the user explicitly asks for test-first work. Closing is
manual-only because it can update project documentation and commit exact files.

## Initialize team Specs

Explicitly request initialization:

```text
/oec-engineering:managing-team-specs init
```

The Skill first inspects repository evidence and presents the exact proposed files. After user
confirmation, it creates only the current-state Specs and ADRs supported by real facts:

```text
ai-docs/engineering/
├── README.md
├── specs/
├── decisions/
└── changes/
```

An absent category is valid; initialization does not emit empty architecture, domain, interface,
data, testing, or delivery templates. Optional root `CLAUDE.md` and `AGENTS.md` blocks point to the
index without copying Skill workflows.

`oec-spec` is added to the Claude Bash `PATH` while the Plugin is enabled:

```bash
oec-spec select --workspace "$PWD" --paths <paths> --format json
oec-spec check --workspace "$PWD"
oec-spec legacy-audit --workspace "$PWD"
```

All three commands are read-only. The audit never deletes old managed files or moves `ai-docs`.

## Migrate an old Dev project

1. Run `oec-spec legacy-audit --workspace "$PWD"` and review the reported manifest, Skills, Agents,
   and preserved `ai-docs` count.
2. Initialize the new team Spec root without modifying old files.
3. Import only evidence-backed current facts and durable decisions from legacy architecture, API,
   and dev-task documents.
4. Commit the new team Specs separately.
5. Treat cleanup of `.oec-ai`, old project Skills, and old Agents as a later destructive operation
   requiring its own exact review and confirmation.

The migration rationale and measured legacy layout are in [../dev-migration.md](../dev-migration.md).

## Boundaries

- Team Specs contain durable, evidence-backed engineering facts.
- Change packages contain context and evidence for a non-trivial change.
- Ordinary implementation, exploration, and validation remain with the main coding agent.
- E3, SAE, UTP, remote Git, and Feishu writes are outside this plugin.
- Installing the plugin does not create `.claude`, `.codex`, or `ai-docs` files in a project.

Project files are created or changed only when the user asks to manage team Specs and confirms the
proposed paths.

## Reference boundary

The team-current-state and change-context separation is independently implemented after studying
Trellis; no Trellis AGPL source, templates, hooks, task runtime, or workflow state machine are
distributed. The focused Skill granularity is informed by Matt Pocock's MIT-licensed engineering
Skills, but the instructions in this Plugin are written for the OEC contract rather than copied as a
second general-purpose workflow library.

## Develop and verify

From the Marketplace root:

```bash
npm ci --ignore-scripts
npm run build
npm test
claude plugin validate ./oec-engineering
git diff --check
```

The build output `dist/oec-spec.mjs` is committed so a Marketplace installation does not need
`node_modules`.
