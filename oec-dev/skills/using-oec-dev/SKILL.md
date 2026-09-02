---
name: using-oec-dev
description: Use when starting any conversation - establishes how to find and use oec-dev Skills, requiring relevant Skill invocation before any response or action
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, do not apply this bootstrap. Follow the dispatch contract and the task context you received.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
Before any response or action, check whether an oec-dev Skill applies. If one applies, invoke it before clarifying questions, repository exploration, planning, or editing. Do not replace Skill invocation with a sentence saying that you will follow the Skill.

If the user is unsure what to do, do not invent work. Inspect enough context to offer two or three concrete, evidence-backed next steps, recommend the simplest option, and ask the user to choose. For non-trivial work, check available Skills before acting.

When a user asks to implement or develop from a PRD, Story, HANDOFF, issue, or other requirement document, the document is a source, not a ready task. For a non-trivial request, invoke `change-plan` first. Show the exact task paths and wait for confirmation before any business-code edit; do not modify code until the task context, minimal Spec/Design pair, and Change Boundary are ready. Once the planning result is ready and any required confirmation is complete, continue the original implementation request with `change-implement`; do not ask the user to repeat the request or manually provide an internal task identity unless a material ambiguity requires it.

If the user provides an existing ready task, invoke `change-implement` directly. If the request is a small obvious fix or ordinary direct coding with no requirement document, do not force task artifacts. For explicit requests for review, diagnosis, TDD, decision challenge, prototyping, durable Specs, legacy migration, or closing, invoke the matching Skill. Keep experimental Web orchestration explicit; do not start it merely because a task has a frontend.
</EXTREMELY-IMPORTANT>

## The operating rule

1. Match the user's actual goal to the narrowest applicable Skill.
2. Invoke that Skill before taking the first related action.
3. Follow its instructions and preserve the user's original intent across Skill handoffs.
4. Report the next required user decision only when the Skill requires a material confirmation; never make the user act as the router between planning and implementation.

Prefer the smallest sufficient change. Preserve unrelated user work, define observable success criteria, and verify final behavior before claiming completion. If work changes a stable responsibility, interface, invariant, failure mode, module boundary, or verified command, proactively identify the durable document that may need review.
