# ParetoProof

ParetoProof is a public benchmark and evaluation harness for frontier models working on Lean theorem proving and Lean formalization tasks.

The immediate goal is simple: make the current Pareto frontier legible. That means reproducible runs, explicit benchmark task definitions, and a workflow that can evaluate both low-latency `pass@1` performance and higher-effort autonomous attempts.

## Why this repository exists

Lean capabilities are moving too quickly to rely on slow, one-off evaluations. ParetoProof is designed to make it cheap to:

- add benchmark items with clear provenance,
- run comparable evaluations across model families and settings,
- publish artifacts instead of only headline scores, and
- coordinate a distributed research community in one durable place.

## Operating model

- `GitHub Discussions` are for proposals, design debates, onboarding, and announcements.
- `GitHub Issues` are for scoped work with a definition of done.
- `GitHub Projects` are for execution tracking.
- `Discord` is only for fast coordination; any durable decision should be summarized back into GitHub.

## MVP scope

The first public milestone focuses on four tracks:

1. Natural-language math problem -> Lean theorem statement.
2. Lean theorem statement -> Lean proof.
3. Broken or partial Lean proof -> repaired Lean proof.
4. Full-stack problem -> statement + proof under a bounded tool and time budget.

The repository already includes initial schemas for benchmark items and run manifests in [schemas](./schemas), alongside example payloads in [benchmarks/examples](./benchmarks/examples) and [runs/examples](./runs/examples).

## Repository map

- [docs/scoping/benchmark-spec.md](./docs/scoping/benchmark-spec.md): benchmark tracks, evaluation modes, and scoring.
- [docs/scoping/platform-architecture.md](./docs/scoping/platform-architecture.md): recommended system architecture.
- [docs/scoping/collaboration-model.md](./docs/scoping/collaboration-model.md): communication, governance, and decision flow.
- [docs/scoping/deployment-plan.md](./docs/scoping/deployment-plan.md): local-first and cloud deployment strategy.
- [docs/scoping/ai-automation.md](./docs/scoping/ai-automation.md): Codex/OpenAI review and issue-response plan.
- [docs/adrs/0001-initial-operating-model.md](./docs/adrs/0001-initial-operating-model.md): initial architecture decision record.

## Contributing

Start with [CONTRIBUTING.md](./CONTRIBUTING.md). If you want to propose benchmark content, a runner design, or a model integration, open a Discussion first when the scope is still fuzzy. Once the work is concrete, open or claim an Issue and move it through the project board.

## License

Code and repository materials are currently released under [Apache-2.0](./LICENSE). If benchmark content later needs per-dataset licensing, that will be documented explicitly instead of being implied.
