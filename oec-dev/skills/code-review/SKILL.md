---
name: code-review
description: Performs a read-only, risk-prioritized review of a working-tree diff, commit, branch comparison, or pull request when the user asks for code review or merge readiness. It can use an existing taskRef and report possible stale Team Specs. Do not use to implement requested changes, generate a general architecture report, or review a product PRD.
argument-hint: "[diff, taskRef, commit, branch, or pull request]"
---

# Review code

Review the requested change against actual behavior, repository evidence, the resolved task Spec/Design
when supplied, and the contract closest to the changed code. Establish the exact review target and
inspect its complete diff.

When a taskRef is supplied, resolve and validate it once through the task checker before judging the
patch. The result includes the canonical task object:

```bash
oec-spec task check --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --stage structure --format json
```

Use `oec-spec select --workspace "$DEV_ROOT" --paths <changed paths> --format json` with team Specs
when they exist, then consult the returned Specs and accepted ADRs. Product sources are read from
`PRODUCT_ROOT`; do not modify any document as part of review.

Prioritize defects that can change behavior, security, data integrity, compatibility, availability,
or operability. Style preferences and generic best practices are not findings unless they violate an
explicit project rule or create a concrete failure.

For every material finding provide:

- the tightest file and line location;
- observed code or missing guard;
- triggering input, state, or environment;
- user or system consequence;
- minimal correction direction without rewriting the patch.

Order findings by likely impact. Use stable IDs such as `CR-01`; do not assign grades or numeric
confidence. If there are no material findings, say so without filler.

When changed paths are available, run the read-only reminder:

```bash
oec-spec remind --workspace "$DEV_ROOT" --paths <changed paths> \
  [--task-ref <taskRef>] --format json
```

Report candidates as advisory possibilities, not proof that a Spec is stale. Return the review target,
material findings, evidence gaps, and one suggested next action. If the user later authorizes clear
mechanical repairs, the Main Session may choose `checker`; do not invoke it or modify files as part of
this read-only review.

Remain read-only: do not edit files, create review artifacts, stage changes, commit, deploy, or write
external task state.
