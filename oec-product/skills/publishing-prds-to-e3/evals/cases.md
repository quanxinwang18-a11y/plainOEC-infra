# Publishing PRDs to E3 evaluation cases

- Missing HANDOFF returns `blocked`; the Skill does not create it.
- First use returns space names and waits for a user choice.
- A ready plan always receives an explicit confirmation before execution.
- A partial remote result is reported as partial and includes a resume action.
- Complete requirements with a missing story task ID are not reported as published.
- A pending POMP selection resumes with POMP candidates rather than asking for the product space again.
- Multiple POMP defaults are presented for selection instead of choosing the first entry.
- A changed fingerprint for a version with mapped IDs is blocked and directs the user to a new version.
- A mapped object whose remote title or parent relationship changed is reported as drifted and blocked.
- A legacy mapping is shown as an adoption warning and is not current until the user confirms execution.
