---
artifact: task-spec
schema_version: 1
task_ref: versioned:vX.Y.Z/task-slug
feature_name: featureName
external_change_id: vX.Y.Z-featureName
title: <task title>
module_ids:
  - <module-id>
affected_paths:
  include:
    - <repository-relative-glob>
source:
  kind: product
  root: product
  repository: <product-repository>
  revision: <commit-or-tag>
  prd_path: ai-docs/versions/vX.Y.Z/prd/prd-vX.Y.Z-featureName.md
  handoff_path: ai-docs/versions/vX.Y.Z/prd/HANDOFF.yaml
  stories:
    - US-001
related_specs:
  - SPEC-example
---
# <task title>

## Goal and scope

<!-- State the behavior, in-scope boundary, and explicit exclusions. -->

## Acceptance

- AC-001: <observable completion condition>
