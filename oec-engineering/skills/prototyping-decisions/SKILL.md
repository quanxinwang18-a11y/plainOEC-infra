---
name: prototyping-decisions
description: Builds a deliberately throwaway interaction or behavior prototype to answer one explicit engineering-design question and obtain human feedback. Use when the user asks to prototype alternatives or exercise a state model before production implementation. Do not use for production features, polished demos, generic feasibility research, or questions an ordinary test or command can answer.
argument-hint: "[design question, alternatives, or state model to prototype]"
---

# Prototyping decisions

Build the smallest disposable artifact that lets a human answer one design question. The prototype is
an experiment, not an early production implementation.

## Frame the experiment

Inspect the relevant product and code context, then state:

- the single question the prototype will answer;
- the decision the user will make after trying it;
- the observations that would distinguish the alternatives;
- behavior deliberately excluded from the experiment.

If the answer can be obtained more directly with a test, benchmark, source read, or command, use that
signal instead of building a prototype.

## Choose the minimum form

For an interaction question, create meaningfully different alternatives that the user can switch
between without changing routes or rebuilding. Preserve only the real content and interactions needed
to compare them; do not invent business claims or polish unrelated surfaces.

For a behavior or state question, provide controls for the relevant events and keep the complete
current state, outputs, and transitions visible. Include only the scenarios that separate plausible
designs. Do not add persistence, services, or abstractions unless they are themselves the question.

Prefer a self-contained artifact in the operating system's temporary directory. If the experiment
must use repository dependencies or routing, propose a clearly named throwaway path and obtain the
user's agreement before adding tracked files. Never place prototype code in a production path or
commit it unless the user explicitly asks to preserve it.

## Run and decide

Verify that the prototype starts, each relevant control or alternative works, and the displayed state
matches the experiment. Use an available browser or project command without installing unrelated
dependencies.

Give the user the exact path or command and ask them to make the design decision. Do not choose a
preference on their behalf. Record:

- what the user observed;
- the selected or rejected alternative;
- uncertainty the prototype did not resolve;
- the production requirements implied by the decision.

Do not promote the prototype into production code automatically. A request to implement the decision
is a new change: follow the repository's normal design, testing, and review practices rather than
treating the throwaway artifact as the implementation baseline.
