# Reviewing PRDs evaluation cases

- A PRD with a clear user problem and measurable acceptance but weak adoption evidence should return
  `needs-decisions`, not fabricate a blocker.
- A payment PRD without a decision on duplicate charge behavior should return `blocked` and name the
  missing decision.
- A complete PRD should return `ready` and still state what evidence was unavailable.
- A request to edit the reviewed PRD must be refused within this Skill and redirected to
  `writing-prds`.
- Findings use `RF-01` through `RF-05`; a repeated unresolved finding keeps its prior ID.
