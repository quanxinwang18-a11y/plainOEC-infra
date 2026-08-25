# Changelog

## 1.0.1

- Persist `prepared`, `executing`, `executed`, and `failed` plan states with stable run markers before
  the first remote execution request.
- Recover uncertain results by exact marker lookup and guarantee that replaying one plan token never
  sends a second pipeline-run POST.
- Mark execution as idempotent for callers and reject malformed or unknown HTTP success payloads.

## 1.0.0

- Add guarded discovery, selection, execution, and status verification for existing pipelines.
- Bind runs to canonical Git workspace, exact remote/ref/HEAD, dev/test origin, stages, and remote configuration.
- Block pipeline management, arbitrary parameters, production targets, and blind POST retries.
- Validate the Server through mock/integration journeys only; real non-production execution remains
  intentionally unclaimed until a target repository and pipeline are explicitly authorized.
