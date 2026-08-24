# Changelog

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
