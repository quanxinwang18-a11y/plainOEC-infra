# E3 publish contract

- One HANDOFF `sub_prds` item maps to one E3 system requirement.
- Each story in that child maps to one task under the system requirement.
- E3 publication never changes the PRD split granularity.
- The E3 publication record lives at `ai-docs/integrations/e3/publications/vX.Y.Z.yaml`.
- `ready` is a non-mutating plan, `partial` is a resumable checkpoint, and `published` means every
  expected requirement and task has a verified remote ID.
- Warnings must be shown before confirmation. Errors block publication.
- A partial run is not rolled back and must not be described as published.
- The user sees product-space names and E3 links; protocol details and credentials remain internal.
- A version with any mapped remote ID is immutable. A changed artifact fingerprint requires a new
  PRD version, and one version cannot be rebound to another E3 product space.
- A mapped remote ID must still resolve to the expected title. A task must remain under its expected
  system requirement. Missing objects are resumable; identity drift is blocking.
- A legacy record without an artifact fingerprint is diagnostic-only until its IDs, titles, and
  parent relationships are verified and the user confirms adoption into schema v2.
- A POMP project is selected automatically only when it is the sole candidate or the sole explicit
  default. Otherwise the user chooses from the current E3 candidates; an empty list blocks publishing.
- Product-space and POMP selections use a 15-minute opaque token bound to the authorized workspace
  and returned candidates. A selection from one workspace cannot configure another workspace.
- Status verifies schema v2 records in their recorded product space even if current workspace
  configuration is absent or different. A legacy record without a recorded space needs workspace
  configuration for diagnosis and cannot report `published` before confirmed adoption.
