# PRD red-team rubric

For each ranked finding provide:

1. **承重假设**: the claim on which value, adoption, feasibility, or correctness depends.
2. **最强成立理由**: the strongest evidence-based case that the claim is true.
3. **失败条件**: a concrete condition that would make the claim false or immaterial.
4. **所需证据**: a named observation, dataset, interview, prototype result, or decision.
5. **停止或调整条件**: the threshold that changes scope or stops the proposal.
6. **最低成本验证**: the smallest test that can reduce uncertainty now.

Rank by consequence, plausibility, and evidence gap. Do not turn every uncertainty into a blocker.
Acknowledge claims that hold up. Put missing source material under “无法判断”, not under findings.

Use `blocked` only when the current requirement cannot be responsibly delivered. Use
`needs-decisions` for bounded open decisions. Use `ready` when remaining uncertainty is ordinary and
the acceptance criteria are sufficient for the proposed scope.
