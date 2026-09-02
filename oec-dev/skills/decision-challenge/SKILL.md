---
name: decision-challenge
description: Stress-tests a proposed engineering decision through a user-led challenge that exposes assumptions, dependencies, and unresolved tradeoffs. Use when the user asks to challenge, grill, pressure-test, or argue against a technical plan or design. Do not use for ordinary planning, implementation, code review, or work already governed by an accepted Spec or ADR.
argument-hint: "[decision, plan, design, or assumption to challenge]"
---

# Challenge decision

Challenge the decision before anyone turns it into an implementation plan. The user owns product,
risk, and tradeoff choices; repository evidence owns discoverable facts. Do not make either kind up.

## Establish the target

State the decision being challenged, the outcome it is meant to achieve, and the boundary of the
discussion. Inspect relevant code, configuration, tests, Specs, ADRs, and referenced requirements
before asking questions. If an accepted Spec or ADR already settles the decision, surface that fact
and ask whether the user intends to revisit it; do not silently reopen it.

Separate what you find into:

- verified constraints and observations;
- assumptions that still need evidence;
- choices that require human judgment;
- downstream choices that depend on an unsettled choice.

## Work through the decision frontier

Build a dependency map of the unresolved choices. In each round, ask only the independent questions
whose prerequisites are already settled. Do not ask the user for facts available from the repository,
and do not ask a downstream question while its premise is still open.

For every question:

- explain which decision it controls;
- present materially different options when alternatives exist;
- give a recommended answer and the evidence or tradeoff behind it;
- make reversibility, failure cost, and evidence gaps visible when they affect the choice.

Use adversarial probes selectively: test the opposite choice, the simplest alternative, the likely
failure path, and what new evidence would change the recommendation. Do not turn these probes into a
fixed checklist or demand ceremony that does not change the decision.

After each user response, update the dependency map and continue from the newly available frontier.
Stop when the decision is supported, rejected, explicitly deferred, or blocked on named evidence.

## Conclude the challenge

Return a compact decision record containing:

- accepted and rejected choices with reasons;
- assumptions converted into verified facts;
- unresolved choices and the evidence or owner they need;
- consequences for scope, compatibility, risk, and verification;
- the smallest sensible next action.

Do not create task files, modify code, write external state, or transition into planning or
implementation unless the user separately requests that next action.
