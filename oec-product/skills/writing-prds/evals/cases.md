# Writing PRDs evaluation cases

## Positive cases

- “根据这些业务事实写一份 v2.1.0 增量 PRD，并拆成 child PRDs。”
- “Revise the checkout requirement and regenerate HANDOFF from the finalized increment PRD.”
- A wording-only correction that does not change behavior updates the root PRD and changelog without
  creating a new version.
- Missing product decisions remain pending instead of being invented to make the document complete.

## Negative cases

- “只读评审这份 PRD 是否可以提交。”属于 `reviewing-prds`。
- “Design the database migration and rollback plan for this requirement.” belongs to engineering
  planning, not PRD writing.
- “将 v2.1.0 发布到 E3。”属于 `publishing-prds-to-e3`。
- “Create development tasks in E3 and start DEV-01.” belongs to E3 development-task operations.
