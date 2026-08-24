---
name: planning-engineering-changes
description: Produces a technical design or implementation plan when the user asks to design a non-trivial code change, write a technical proposal, assess architecture tradeoffs, or plan cross-module work. Do not use for ordinary implementation, a small obvious fix, product PRD authoring, or external task creation.
argument-hint: "[requirement, PRD, issue, or technical change]"
---

# Planning engineering changes

## Before planning

Before designing a solution, verify the problem is understood. Answer these three questions:

1. Can you state the behavior gap? (what happens now vs. what should happen)
2. Are the boundaries known? (scope, out-of-scope, constraints)
3. Are there multiple plausible approaches?

If the answer to (3) is "yes" OR answers to (1) or (2) are unclear:
  → Pause design. Generate 2–3 alternative approaches, each with tradeoffs. Present them
    and wait for the user to choose a direction. Do not proceed to design until the user
    selects an approach.

Otherwise:
  → Proceed to design.

Turn the requested behavior into an implementable engineering decision grounded in the current
repository. Explore code, configuration, tests, existing documentation, and accepted ADRs before
prescribing a design. When target paths are known, run:

```bash
oec-spec select --workspace "$PWD" --paths <target paths> --format json
```

Read only the returned team Specs plus directly relevant source material. A product PRD defines
user-visible behavior; do not silently change it to simplify implementation. Ask for a missing fact
only when different answers would materially change the design.

## Choose the lightest useful output

- For a small, local change, plan in the conversation. Do not create a document merely to satisfy a
  process.
- Persist `ai-docs/engineering/changes/<change-id>/change.md` for cross-module, public interface,
  data, compatibility, migration, or otherwise high-risk work.
- Add `design.md` only when a meaningful technical tradeoff needs a durable decision.
- Add `plan.md` only when dependency order, coordination, rollback, or verification needs to survive
  the current conversation.

Version-linked IDs use `vX.Y.Z-<featureName>`; unversioned technical work uses
`YYYY-MM-DD-<slug>`. Link the source PRD, HANDOFF, story, or issue instead of copying it.

Describe the intended boundary, affected interfaces and invariants, chosen design, significant
alternatives, compatibility or migration consequences, and observable verification. Let the main
coding agent choose routine file order and implementation detail unless ordering itself controls
risk.

## Change boundary

When transitioning from planning to implementation, state the change boundary before writing code:

- The smallest behavior gap between what happens now and what should happen.
- Where that behavior actually lives (not where it is easiest to intercept).
- Which files you expect to change, and why each one is necessary.
- What you are explicitly not doing in this change.

If the real scope turns out to be larger than this, say so and why before continuing. Do not widen
on your own.

Planning is read-only with respect to business code and external systems. Do not implement the
change, create E3 tasks, deploy, or commit Git as part of this Skill.
