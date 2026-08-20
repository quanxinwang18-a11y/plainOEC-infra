---
name: reviewing-prds
description: Performs a read-only red-team review of an OEC PRD. Use when the user asks to review a PRD, challenge assumptions, find product risks, or decide whether a requirement is ready to submit.
argument-hint: "[PRD path or version]"
---

# Reviewing OEC PRDs

Review the product reasoning, not merely the presence of headings. Extract load-bearing claims,
steelman each claim, then challenge the strongest version with concrete falsifiable conditions.

Use [references/review-rubric.md](references/review-rubric.md). Return at most five ranked findings,
then list what is well-reasoned and what cannot be assessed from available evidence.

Choose one decision:

- `blocked`: a missing decision or unsupported premise makes the requirement unsafe to deliver.
- `needs-decisions`: work can continue, but named product decisions or evidence remain.
- `ready`: no blocking product assumption was found in the available material.

Remain read-only. Do not edit PRDs, create review files, stage changes, or commit. Do not use letter
grades, numeric scores, generic risks, fabricated evidence, or implementation-design criticism.
