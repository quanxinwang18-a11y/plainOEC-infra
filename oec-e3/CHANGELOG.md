# Changelog

## 1.0.2

- Add safe natural-language examples for read-only status and non-mutating plan preparation.
- Replace version-by-version README narration with the current evidence boundary and a stable
  repository link; tool names and remote-write contracts are unchanged.

## 1.0.1

- Resolve the acting account only from explicit configuration, compatible environment variables, or
  a verified JWT claim; ambiguous identity now fails before any remote write.
- Expose optional non-secret `e3_user_account` Plugin configuration and stop inferring identity from
  a product-space creator.
- Reject empty, malformed, array, and unknown HTTP success payloads instead of treating any 2xx
  response as an accepted E3 operation.
- Serialize PRD publication by workspace/version and development creation/progress by
  workspace/change ID through exclusive Plugin Data locks.
- Cover concurrent service instances sharing Plugin Data so competing plans cannot create duplicate
  requirements, duplicate development tasks, or duplicate worklog updates.

## 1.0.0

- Extract the guarded PRD publication Server from the Product Plugin without changing its four tool
  names or publication contracts.
- Add six bounded tools for development requirement selection, task creation/reuse, progress updates,
  partial checkpoints, and read-only status verification.
- Register as the `oec-product@3.x` platform dependency and retain independent Plugin Data for OAuth,
  workspace configuration, selections, and plans.
- Complete a real authorized non-production journey for PRD publication/reuse and development task
  creation/reuse, start, worklog, completion, and status verification.
