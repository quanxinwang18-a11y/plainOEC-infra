# Publishing PRDs to E3 evaluation cases

## Positive cases

- “将已经完成拆分和 HANDOFF 的 v1.4.0 PRD 发布到 E3。”
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

## Negative cases

- “先帮我补完这个还没 finalized 的 PRD。”属于 `writing-prds`。
- “Create E3 development tasks from this engineering plan.” is a development-task operation, not
  PRD publication.
- “给 DEV-03 记录 2 小时工时并完成任务。”属于 E3 task-progress operation.
