---
name: develop-test-first
description: Applies test-driven development when the user explicitly asks for TDD, test-first implementation, or a red-green-refactor loop. Do not use merely because a feature or bug fix should have tests, and do not replace the repository's existing test strategy.
argument-hint: "[behavior or change to implement test-first]"
---

# Develop test-first

Use the repository's real test framework, commands, and public seams. Consult the path-relevant team
Specs and testing guidance when they exist; do not introduce a new framework or testing convention
without a demonstrated need and user agreement.

Work in narrow vertical slices:

1. State one observable behavior and select the smallest stable public interface that can prove it.
2. Add a focused test and run it. Confirm that it fails for the intended missing behavior, not for a
   broken fixture, environment, or unrelated error.
3. Implement only enough behavior to make that slice pass.
4. Run the focused test and relevant regression checks, then improve the design while preserving
   green behavior.
5. Repeat for the next behavior that materially changes the implementation.

Prefer tests that survive refactoring. Avoid assertions on private methods, internal call order, or
incidental storage when the behavior can be observed through a stable interface. Use mocks at real
external seams, not as a default replacement for collaborating production code.

Do not write every test before all implementation, force a specific ratio of unit and integration
tests, or require a persistent task package. If the environment cannot produce a reliable red/green
signal, explain the limitation and agree on another observable verification rather than claiming
TDD completion.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This is too simple to need a test" | Simple code breaks. A focused test costs seconds. |
| "I'll implement first, add tests after" | After-the-fact tests pass immediately and prove nothing. |
| "I already ran the test earlier" | Only the most recent run counts. Re-run now. |
| "The linter passed" | A linter is not a test runner. |
