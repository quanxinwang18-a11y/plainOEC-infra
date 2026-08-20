# Version decisions

Use semantic versions as a product communication convention:

- Major: a new product direction or incompatible product behavior.
- Minor: a new user capability or module.
- Patch: a bounded behavior change delivered as a version.

A correction that does not alter user-visible behavior, scope, a business rule, or acceptance
criteria is an amendment: update the root PRD and changelog without creating a version.

When evidence supports more than one choice, recommend the smallest valid increment and ask the PM
to confirm. Never infer a missing version by rewriting historical artifacts.
