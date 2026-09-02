# Changelog

## Unreleased

- Add a shared `taskRef` contract for versioned `dev-task` packages and unversioned Engineering changes,
  including legacy change-ID resolution and safe DEV_ROOT containment.
- Add deterministic `spec.md`/`design.md` task-pair validation with structured identity, source, module,
  section, acceptance, and cross-reference checks.
- Add Product Root / Dev Root source resolution for same-space and split-space repositories without
  copying or writing Product artifacts.
- Add advisory `oec-spec remind` checks at planning, review, and close checkpoints; reminders are read-only,
  have no state file, and do not interrupt Direct Coding.
- Update Engineering Skills and Agents to consume the normalized task reference while preserving the
  current no-router, no-default-Agent distribution boundary.

## 1.8.0

**BREAKING RC CHANGE:** normalize public capability names before the first stable release.

- Rename Skills: `managing-team-specs` → `manage-specs`, `migrating-legacy-ai-docs` →
  `migrate-legacy-ai-docs`, `planning-engineering-changes` → `plan-change`,
  `challenging-engineering-decisions` → `challenge-decision`, `prototyping-decisions` →
  `prototype-decision`, `test-driven-development` → `develop-test-first`,
  `diagnosing-failures` → `diagnose-failure`, `reviewing-code-changes` → `review-code`,
  `delegating-engineering-agents` → `delegate-agents`, `orchestrating-long-running-coding` →
  `run-long-coding`, and `closing-engineering-changes` → `close-change`.
- Rename Agents: `oec-research` → `researcher`, `oec-implement` → `implementer`,
  `oec-evaluate` → `evaluator`, and `oec-check` → `checker`.
- Replace delegation mode `full` with `sequence`; no compatibility alias is retained.
- Clarify that `checker` may repair unambiguous mechanical issues, narrow long-running input to an
  existing Change, and simplify user-facing descriptions without changing runtime boundaries.

## 1.7.0

- Add `orchestrating-long-running-coding` for an explicitly requested,
  bounded Web/full-stack `implement → runtime evaluate → repair` loop in the current main session.
- Add `oec-evaluate`, a Playwright-based runtime evaluator that uses an already configured MCP,
  exercises local or authorized internal non-production applications, and never authors code or
  project documentation.
- Reuse one implementation Agent ID and one evaluator Agent ID across at most five cycles by
  default, with an explicit continuation capped at ten; keep final `oec-check`, closing, commits,
  framework adapters, persistent workflow files, and external platform state outside the loop.

## 1.6.0

- Add the manual-only `delegating-engineering-agents` Skill as a single explicit entry point for
  `oec-research`, `oec-implement`, and `oec-check`.
- Gate the sequential `full` mode on persisted change context, a concrete research question,
  complete Agent reports, and explicit handling of pre-existing working-tree changes.
- Keep delegation stateless and host-native: no automatic retries, workflow state, commits, external
  writes, or changes to the three Agent contracts.

## 1.5.1

- Require `oec-implement` and `oec-research` to receive an existing change ID instead of inventing a
  change package.
- Require implementation and review Agents to run affected tests and report partial or failed
  verification when evidence is missing.
- Keep Claude and Codex Agent instructions aligned, make closing manual-only in Codex, and replace
  prose-only case lists with native executable routing evals for all nine Skills.
- Define risk-appropriate closing review: main-session self-review for small local changes, and
  fresh-context review or an evidence-recorded user waiver for persisted high-risk change packages.

## 1.5.0

- Add the explicit-only `challenging-engineering-decisions` Skill for evidence-grounded, user-led
  pressure testing without transitioning into planning or implementation.
- Add `prototyping-decisions` for minimal throwaway interaction or state experiments whose result is
  a human design decision rather than production code.
- Keep both capabilities independent from task state, external platforms, and the ordinary coding
  workflow.

## 1.4.0

- Add the explicit-only `migrating-legacy-ai-docs` Skill for evidence-backed migration into current
  Specs, ADRs, and active change packages.
- Preserve legacy `ai-docs` in place and keep E3 adoption, managed-configuration cleanup, deletion,
  and external writes outside the migration Skill.
- Encode explicit invocation for both Claude Code and the experimental Codex Skill interface.

## 1.3.0

- Remove the SessionStart Hook so installing the Plugin adds no context to unrelated sessions.
- Make the three optional sub-agents explicit-use capabilities and document host-native dispatch.
- Keep the Codex configuration experimental until Agent discovery and `oec-spec` availability pass
  a real isolated installation test.

## 1.2.0

- Add SessionStart Hook that injects a compact capabilities table, project Spec state
  (detected dynamically), and getting-started guidance when no Specs exist.
- Add three optional sub-agents: oec-implement (isolated implementation), oec-check
  (fresh-eyes review), oec-research (background research). Agents are user-dispatched,
  not auto-triggered.

## 1.1.0

- Add optional sub-agents for implement, check, and research.

## 1.0.3

- Add pre-planning maturity check (three questions before design) and change boundary
  declaration (behavior gap, expected files, explicit exclusions) to planning.
- Add pre-close verification (tests run, Spec invariants, prior TDD/code-review results)
  to closing.

## 1.0.2

- Add structured analysis framework (package boundaries, core abstractions, conventions,
  decisions) and content quality standards (evidence-backed claims, anti-patterns from
  real code, avoidance rules) to managing-team-specs.

## 1.0.1

- Add circuit breaker (3 failed fix attempts → re-examine architecture) to diagnosing-failures.
- Add Red Flags table (4 common rationalizations) to test-driven-development.

## 1.0.0

- Add six focused Skills for team Specs, technical planning, explicit TDD, difficult diagnosis,
  read-only code review, and explicit engineering closure.
- Add the project-owned current-state Spec, ADR, conditional change-package, and exact Git contract.
- Add dependency-free path selection, contract validation, and read-only legacy Dev audit tooling.
- Keep ordinary coding with the main Claude Code Agent; no Dev Agent, workflow state machine,
  MCP, Command, or project settings are installed.
