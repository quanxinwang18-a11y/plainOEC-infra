---
name: publishing-prds-to-e3
description: Publishes completed OEC child PRDs and HANDOFF mappings to E3. Use for explicit E3 publishing requests.
argument-hint: "[vX.Y.Z]"
disable-model-invocation: true
---

# Publishing PRDs to E3

Publish only an already finalized version. Do not write or re-split PRD content in this Skill.

1. Call the bundled E3 MCP tool `prepare_prd_publish` with the current workspace root and the version
   from `$ARGUMENTS`, or omit the version to use the latest valid version.
2. If it returns `needs_space_selection`, show only the candidate space names, obtain the user's
   choice, call `select_product_space`, and prepare again.
3. If it returns `blocked`, report the exact artifact or configuration problems and stop.
4. For `ready`, show the product-space name, requirements to create or reuse, story tasks to create
   or reuse, and warnings. Ask for explicit confirmation of that plan.
5. After confirmation, call `execute_prd_publish` with the returned opaque plan token.
6. Call `get_prd_publish_status` for independent status verification.

Say “已发布” only when the verified state is `published`. For `partial` or `blocked`, report created
objects, missing objects, the mapping path, and the safe resume action. Never improvise an E3 payload
or call lower-level HTTP endpoints.

Use [references/publish-contract.md](references/publish-contract.md) for user-visible status and
mapping semantics. Authentication, transport, retries, IDs, and idempotency belong to the MCP server.
