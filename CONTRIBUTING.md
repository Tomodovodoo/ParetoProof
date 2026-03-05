# Contributing

Thanks for contributing to ParetoProof.

## Where work happens

- Use `Discussions` for open-ended proposals, design questions, and benchmark strategy.
- Use `Issues` for concrete work items with a definition of done.
- Use the `Project` board to track status once an issue is active.

## Before opening a pull request

1. Check for an existing issue or discussion.
2. If the scope is not settled, open a discussion first.
3. If you are adding benchmark content, include provenance, licensing constraints, and the exact Lean/mathlib assumptions.
4. If you are adding infrastructure, document the operational tradeoff, not just the code.

## Pull request expectations

- Keep pull requests focused.
- Explain the motivation, the change, and how it was validated.
- For benchmark additions, include example inputs and expected outputs where possible.
- For runner or platform changes, call out security implications and cost implications.

## Decision hygiene

- Durable decisions belong in the repository, not only in chat.
- If a Discord conversation produces a decision, summarize it in an issue, pull request, discussion, or ADR.
- If an architectural choice changes the future shape of the project, add or update an ADR in `docs/adrs/`.

## First contributions

Good early contributions include:

- writing missing benchmark-item metadata,
- improving schemas and examples,
- tightening docs around Lean setup or reproducibility,
- adding low-risk tooling and validation.
