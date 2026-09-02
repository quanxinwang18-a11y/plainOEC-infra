---
name: change-implement
description: Implements an existing development task in the Main Session when the user asks to implement a canonical taskRef or existing change ID that resolves to a ready Spec/Design pair. A PRD-only implementation request must go through task planning first. Do not use to create task artifacts, handle ordinary small fixes, review code, close changes, or operate E3, Pipeline, or deployment.
argument-hint: "[taskRef or existing change ID]"
---

# Implement change

Implement the task the user identifies in the Main Session. This is a lightweight execution entry,
not a workflow engine and not a replacement for ordinary coding.

If the user provides only a PRD, Story, HANDOFF, issue, or other requirement document and no ready
`taskRef`/change ID, do not edit business code. Route the request to the planning gate first; the
PRD is a source, not an implementation authorization or a ready task package.

## Resolve before inspecting or editing

Require a canonical `taskRef` or an existing change ID. Establish `DEV_ROOT` and, when Product files
are separate, `PRODUCT_ROOT` from explicit roots; never guess among candidate directories.

Make the first repository operation a task resolution/check; do not run `git status`, list task directories,
or read task files before this check:

```bash
oec-spec task check --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --stage ready --format json
# use --change-id <changeId> instead when the input is a legacy change ID
```

Use the result's canonical task,
roots, source, artifacts, and affected paths. If the task is missing,
ambiguous, unsafe, identity-mismatched, or not `ready`, stop with `blocked` or `partial` and do not
create or guess a task package.

Then select only the relevant engineering context:

```bash
oec-spec select --workspace "$DEV_ROOT" --paths <affected paths> --format json
```

Read the returned Team Specs and accepted ADRs, followed by the resolved `spec.md`, `design.md`, and
any explicitly referenced Product source. Product Root is read-only.

## Implement within the declared boundary

- Follow the task Spec, Design, and Change Boundary; do not silently widen affected paths.
- Keep `featureName`, task slug, external `changeId`, and `taskRef` distinct.
- Do not create `implementation-plan.md`, status files, progress files, or a second task artifact by default.
- Do not dispatch an Agent by default; use the Main Session for implementation.
- Do not commit, push, merge, call `change-close`, create E3 tasks, update E3/Pipeline, or deploy.
- If the task design or product source is materially ambiguous, stop and return the decision to the user.

Use another capability only when its own trigger is present: invoke `test-first` for an explicit
TDD request, `failure-debug` when the root cause is unclear, and `code-review` only when the user
asks for a review. Do not invoke those capabilities merely because tests, diagnosis, or review might
be useful.

## Verify and report

Run the tests named by the task Design or the smallest relevant repository checks. Also run applicable
typecheck and lint commands. The latest result is the only completion evidence; missing, skipped, or
failed checks must be reported as `partial` or `failed`.

Return:

```markdown
## Development report

### Status
- <complete, partial, failed, or blocked>

### Task
- taskRef: <canonical taskRef>
- compatibility: <native or legacy>

### Files changed
- <path> — <what changed and why>

### Verification
- Tests: <command and pass/fail/not run>
- TypeCheck: <pass/fail/not run>
- Lint: <pass/fail/not run>

### Open issues
- <scope decision, unexecuted check, residual risk, or none>
```

Do not claim completion without current verification evidence and an unchanged task boundary.
