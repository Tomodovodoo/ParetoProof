# ADR 0001: Initial Operating Model

## Status

Accepted

## Context

ParetoProof starts from zero infrastructure but needs to move quickly without creating long-term coordination debt.

## Decision

- Start in a public repository under the maintainer account and transfer to a future `ParetoResearch` organization if needed.
- Use GitHub as the durable system of record.
- Use Discussions for open-ended design and community threads.
- Use Issues plus a Project board for scoped execution.
- Keep benchmark definitions and run manifests versioned in git.
- Prefer local-first or single-VM execution before building a larger hosted platform.
- Treat Codex/OpenAI review as advisory automation, not autonomous governance.

## Consequences

- The project can start immediately without waiting on domain or organization setup.
- Collaboration quality depends on disciplined issue and discussion hygiene.
- Early infra choices remain reversible because the public contract is the schema and run manifest, not a large product surface.
