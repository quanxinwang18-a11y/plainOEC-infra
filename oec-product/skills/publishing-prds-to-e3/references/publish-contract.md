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
- A version with any mapped remote ID is immutable. A changed artifact fingerprint requires a new
  PRD version, and one version cannot be rebound to another E3 product space.
- A mapped remote ID must still resolve to the expected title. A task must remain under its expected
  system requirement. Missing objects are resumable; identity drift is blocking.
- A legacy mapping without an artifact fingerprint is diagnostic-only until its IDs, titles, and
  parent relationships are verified and the user confirms adoption into schema v2.
- A POMP project is selected automatically only when it is the sole candidate or the sole explicit
  default. Otherwise the user chooses from the current E3 candidates; an empty list blocks publishing.
