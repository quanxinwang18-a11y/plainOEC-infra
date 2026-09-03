---
name: guide
description: Use when starting a conversation or when a user describes an engineering goal; guides goal-first Skill discovery and user-facing next-step interaction without requiring internal OEC process knowledge
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, do not apply this bootstrap. Follow the dispatch contract and the task context you received.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
The user brings a goal, not an internal OEC process. The user does not need to know or name Skills, task identifiers, planning documents, team knowledge files, phases, or Agents. Infer the next useful action from the user's natural language and the repository context, and explain it in user-facing terms.

Before any response or action, check whether an oec-dev Skill applies. If one applies, invoke it before clarifying questions, repository exploration, planning, or editing. Do not replace Skill invocation with a sentence saying that you will follow the Skill.

If the user is unsure what to do, do not invent work or ask them to choose an internal Skill or artifact. Inspect only enough context to offer two or three concrete, evidence-backed next steps, recommend the simplest option, and ask only the material question that changes the work. For non-trivial work, check available Skills before acting.

When a user asks to implement or develop from a PRD, Story, HANDOFF, issue, or other requirement document, the document is a source, not a ready task. For a non-trivial request, invoke `code-plan` first. Explain the proposed scope, exact files, and safe next step in user-facing language; show exact task paths when confirmation is needed, and wait for confirmation before any business-code edit. Once the planning result is ready and any required confirmation is complete, continue the original implementation request with `code-implement`; do not ask the user to repeat the request or manually provide an internal task identity unless a material ambiguity requires it.

If the user provides an existing ready task, invoke `code-implement` directly. If the request is a small obvious fix or ordinary direct coding with no requirement document, do not force task artifacts. For explicit requests for review, diagnosis, TDD, decision challenge, prototyping, durable Specs, legacy migration, or closing, invoke the matching Skill. Keep experimental Web orchestration explicit; do not start it merely because a task has a frontend.

Do not initialize or update durable engineering knowledge merely because a PRD or code change exists. When the work reveals a possible long-lived fact or decision, explain that it may be worth recording and let the relevant Skill handle the user confirmation. Do not force a fixed phase, status, task split, TDD loop, Agent sequence, or commit flow.
</EXTREMELY-IMPORTANT>

## The operating rule

1. Match the user's goal and current context to the narrowest relevant Skill; the user should not have to know its name.
2. Invoke that Skill before taking the first related action.
3. Let the Skill choose any necessary internal planning or knowledge artifacts, while exposing only decisions that materially affect the user.
4. Follow the user's original goal across Skill handoffs and automatically continue it after a confirmed planning result; never make the user act as the router between planning and implementation.

Prefer the smallest sufficient change. Preserve unrelated user work, define observable success criteria, and verify final behavior before claiming completion. If work changes a stable responsibility, interface, invariant, failure mode, module boundary, or verified command, proactively identify the durable document that may need review.
