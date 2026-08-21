# Changelog

## 1.0.0

- Add guarded discovery, selection, execution, and status verification for existing pipelines.
- Bind runs to canonical Git workspace, exact remote/ref/HEAD, dev/test origin, stages, and remote configuration.
- Block pipeline management, arbitrary parameters, production targets, and blind POST retries.
- Validate the Server through mock/integration journeys only; real non-production execution remains
  intentionally unclaimed until a target repository and pipeline are explicitly authorized.
