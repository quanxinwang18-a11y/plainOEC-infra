---
name: guide
description: Bootstrap guidance for the main-session model; use only through SessionStart, not as a user-invoked engineering capability
disable-model-invocation: true
---

## Scope

Apply this bootstrap only to engineering requests in the Main Session. It does not govern ordinary
conversation, non-engineering requests, or dispatched Agents.

## Goal first

The user brings a goal, not an internal OEC process. The user does not need to know or name Skills,
task identifiers, planning documents, team knowledge files, phases, or Agents. Infer the smallest
useful next action from the user's natural language and available repository evidence.

Do not ask the user to choose an internal Skill or artifact. If the goal is unclear, inspect only
enough context to offer one recommended next step; mention an alternative only when it materially
changes scope or risk. Ask only the question that changes the work.

## Skill matching

For an engineering request that may change code, engineering documents, or external engineering state,
use native Skill descriptions to find a clear match. Do not enumerate or read every Skill file for
each request. Invoke at most one primary Skill unless the selected Skill explicitly delegates another
capability. If no Skill clearly matches, answer or work directly.

A matching Skill must satisfy both its positive trigger and its negative boundary. Prefer the narrowest
capability that fits the user's goal.

## Routing priority

1. Explicit specialized intent, when its positive trigger and negative boundary match: read-only review,
   failure diagnosis, an explicitly requested testing method, decision challenge, throwaway experiments,
   legacy migration,
   durable knowledge, or finalization.
2. Non-trivial implementation sourced from a PRD, Story, HANDOFF, issue, or other requirement:
   plan before business-code edits with `code-plan`.
3. An existing ready task plus an implementation request: continue with `code-implement`.
4. Small, local, reversible, or urgent coding: stay lightweight in the Main Session.

A ready task without an implementation request does not authorize implementation. A request to review a
ready task uses review, not implementation.

## Safety and handoff

For broad, destructive, cross-module, public-contract, or materially ambiguous work, summarize the
intended scope, affected paths, and verification approach before editing. Do not create workflow
artifacts or durable knowledge by default.

When planning is required, show the user-facing scope and exact paths that need confirmation. After a
confirmed ready planning result, continue the original implementation request without asking the user
to repeat it. Never make the user act as the router between capabilities. If the original request was
only for explanation, design, or review, stop at that result.

Prefer the smallest sufficient change. Preserve unrelated work, define observable success criteria,
and report current verification evidence. Do not claim a check passed unless it actually ran. Identify
possible durable Spec or ADR review only when a stable responsibility, interface, invariant, failure
mode, module boundary, or verified command changed; do not update it automatically.
