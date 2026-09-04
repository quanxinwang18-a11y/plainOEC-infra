---
name: code-plan-e3-mapping-positive-en
description: Routes an explicit E3 requirement mapping request to planning and a safe evidence-based outcome.
tags: [routing, outcome, positive, code-plan, e3, english]
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

I have an explicit E3 requirement/story in product space `space-202330`, requirement `900101`. Start with a read-only detail lookup, then use the current Dev Root's `CLAUDE.md`, relevant `ai-docs/Spec/` entries, and code paths to classify whether the backend is `required` and one frontend Root I explicitly authorize is `possibly-related`. Show `not-indicated` or `unknown` when evidence is absent, with concrete evidence, matched Specs/paths, and assumptions. Ask me to confirm the repository set before planning each repository separately; do not scan neighboring directories or write another repository; do not create E3 objects.

Expected outcome: use the planning gate, preserve the E3 identity as source evidence rather than a local taskRef, use the read-only E3 detail tool, and stop at the repository-set confirmation boundary.
