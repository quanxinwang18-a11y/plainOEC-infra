# E3 publish contract

- One HANDOFF `sub_prds` item maps to one E3 system requirement.
- Each story in that child maps to one task under the system requirement.
- E3 publication never changes the PRD split granularity.
- The mapping lives at `ai-docs/integrations/e3/vX.Y.Z.yaml`.
- `ready` is a non-mutating plan, `partial` is a resumable checkpoint, and `published` means every
  expected requirement and task has a verified remote ID.
- Warnings must be shown before confirmation. Errors block publication.
- A partial run is not rolled back and must not be described as published.
- The user sees product-space names and E3 links; protocol details and credentials remain internal.
