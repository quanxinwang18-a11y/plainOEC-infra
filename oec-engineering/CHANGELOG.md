# Changelog

## 1.5.1

- Require `oec-implement` and `oec-research` to receive an existing change ID instead of inventing a
  change package.
- Require implementation and review Agents to run affected tests and report partial or failed
  verification when evidence is missing.
- Keep Claude and Codex Agent instructions aligned, make closing manual-only in Codex, and replace
  prose-only case lists with native executable routing evals for all nine Skills.

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
