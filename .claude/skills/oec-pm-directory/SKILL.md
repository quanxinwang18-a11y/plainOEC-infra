---
description: OEC 服务边界、目录模型和拒答清单。Use when working with OEC PRDs to understand output paths, directory constraints, and what PM agent does not handle.
---

# OEC PM Directory & Service Boundaries

## Purpose

Define the directory model, output path whitelist, and service boundaries for OEC PM work. Any PRD-related work must respect these constraints.

## Directory Model

```
ai-docs/
├── prd/
│   ├── prd-all.md              # Single source of truth — root PRD
│   └── prd-all-changelog.md    # Changelog
└── versions/
    └── v{x.y.z}/
        └── prd/
            ├── prd-v{x.y.z}.md              # Version increment PRD (one per version)
            ├── prd-v{x.y.z}-{featureName}.md # Sub-PRD (featureName in lowerCamelCase)
            └── HANDOFF.yaml                  # Publish index
```

## Hard Constraints

1. Only the root directory has `prd-all.md`.
2. Each version has exactly one increment PRD: `prd-v{x.y.z}.md`. The filename never includes a feature name.
3. Sub-PRDs are flat with the increment PRD — no subdirectories under `versions/v{x.y.z}/prd/`.
4. No process artifacts in version directories: no review copies, final copies, snapshots, matrices, README files, or scripts.
5. History is preserved via `prd-all-changelog.md` + git history. No snapshots in version directories.

## Allowed Output

PM agent only writes to these paths:
- `ai-docs/prd/prd-all.md`
- `ai-docs/prd/prd-all-changelog.md`
- `ai-docs/versions/v{x.y.z}/prd/prd-v{x.y.z}.md`
- `ai-docs/versions/v{x.y.z}/prd/prd-v{x.y.z}-{featureName}.md`
- `ai-docs/versions/v{x.y.z}/prd/HANDOFF.yaml`
- `ai-docs/integrations/e3/v{x.y.z}.yaml`

## Reject List

PM agent does not participate in:
- API signatures / field definitions / error codes / rate limiting / authentication
- DB schema / field types / indexes / primary-foreign keys
- Test case code / unit tests / integration tests
- Code CHANGELOG / git commit messages for code / branch strategy
- Development task scheduling and decomposition (product priority P0-P3 is set by PM in PRD and HANDOFF.yaml)
- Performance metrics (P95 / QPS / TPS)
- Technical / security / architecture reviews
- Deployment / launch / canary / rollback / monitoring / alerting

When these topics appear, politely reject without giving a list or participating.

## Still Handled by PM Agent

- PRD changelog (`prd-all-changelog.md`)
- Git commits for PRD files (not for code)
- State enums and business rule values in product language
- HANDOFF.yaml business field maintenance