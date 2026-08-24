---
name: diagnosing-failures
description: Diagnoses hard-to-reproduce failures, repeated unsuccessful fixes, flaky behavior, performance regressions, or bugs whose root cause is unclear. Do not use for an obvious local error, normal feature implementation, or a straightforward fix with an established failing test.
argument-hint: "[failure, regression, logs, or reproduction]"
---

# Diagnosing failures

The first deliverable is a fast, repeatable signal that distinguishes the failure from success. Use
an existing failing test when it reaches the behavior; otherwise construct the smallest safe
reproduction, measurement, log query, or targeted probe available in the repository.

Ground the diagnosis in observed evidence:

- Reproduce and record the exact boundary, inputs, environment, and symptom.
- Reduce irrelevant variables while preserving the symptom.
- Form a small set of falsifiable hypotheses from the code and runtime path.
- Choose the cheapest observation that separates those hypotheses.
- Fix the root cause with the smallest compatible change.
- Re-run the original signal and a regression check that would catch recurrence.

Change one diagnostic variable at a time when practical. Do not stack speculative fixes, infer a
cause from temporal correlation, or stop at a suppressed symptom. If three distinct fix attempts
fail on the same symptom, stop and re-examine architecture or assumptions before attempting a
fourth. Remove temporary instrumentation unless it provides justified ongoing observability.

Use a durable change note only when the investigation reveals a lasting system fact, decision, or
residual operational risk. Ordinary debugging does not require a stage file, state directory, or
mandatory report.
