---
name: review-code
description: Performs a read-only, risk-prioritized review of a working-tree diff, commit, branch comparison, or pull request when the user asks for code review or merge readiness. Do not use to implement requested changes, generate a general architecture report, or review a product PRD.
argument-hint: "[diff, commit, branch, or pull request]"
---

# Review code

Review the requested change against actual behavior, repository evidence, and the contract closest
to the changed code. Establish the exact review target and inspect its complete diff. Use
`oec-spec select` with the changed paths when team Specs exist, then consult the returned Specs and
accepted ADRs.

Prioritize defects that can change behavior, security, data integrity, compatibility, availability,
or operability. Trace enough surrounding code and tests to confirm each claim. Style preferences and
generic best practices are not findings unless they violate an explicit project rule or create a
concrete failure.

For every material finding provide:

- the tightest file and line location;
- the observed code or missing guard that supports the claim;
- the input, state, or environment that triggers failure;
- the user or system consequence;
- a minimal correction direction without rewriting the patch.

Order findings by likely impact. Use stable IDs such as `CR-01` so follow-up can refer to them, but do
not assign grades or numeric confidence. After findings, state what was verified and what could not
be verified from the available environment. If there are no material findings, say so without
inventing filler.

Remain read-only. Do not edit files, create a review artifact, stage changes, commit, deploy, or write
external task state. Independent review context should use the host's native delegation when the
user requests it; do not load Agent Markdown by path.
