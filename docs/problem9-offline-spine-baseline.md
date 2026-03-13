# Problem 9 Offline Spine Baseline

This document records the current ParetoProof MVP spine around the offline
`firstproof/Problem9` slice.

It is the operator-facing bridge between the Problem 9 package, prompt package,
verification, artifact, and ingest baselines. The goal is to make it explicit
what the local spine already guarantees, what the canonical command sequence is
today, and what implementation gap still blocks closing the umbrella delivery
issue.

## Current repository-backed spine

The repository already defines and implements these anchored pieces:

- an immutable checked-in authoring source tree at
  `benchmarks/firstproof/problem9`
- a canonical materialized benchmark package emitted by
  `bun run materialize:problem9-package`
- a canonical prompt package emitted by
  `bun run materialize:problem9-prompt-package`
- the benchmark-owned prompt layers under `apps/worker/prompts/problem9`
- the Lean lane, verifier, budget, artifact, reproducibility, and bundle
  contracts in the adjacent Problem 9 baseline docs

Those pieces are enough to anchor a deterministic local pre-run preparation
flow. They are not yet enough to claim the full offline execution spine is
implemented end to end.

## Canonical local sequence today

The canonical local preparation flow is:

1. Materialize the benchmark package into a clean working root.
2. Materialize a prompt package for one concrete run and attempt identity.
3. Run the provider and bounded repair loop against that prompt package.
4. Execute the authoritative Lean and verifier pipeline.
5. Emit the canonical offline run bundle.
6. Optionally ingest structured metadata derived from the bundle.

Today, steps 1 and 2 are implemented in the repository. Steps 3 through 6 are
defined by baselines but not yet wired into one repository-owned local command.

## Canonical commands for implemented steps

### 1. Materialize the benchmark package

Use:

```bash
bun run materialize:problem9-package -- --output <working-root>
```

This writes the canonical `firstproof/Problem9` package under:

- `<working-root>/firstproof/Problem9`

The generated package manifest contains the immutable digest-bearing
`benchmark-package.json` that downstream prompt and run tooling must trust.

### 2. Materialize the prompt package

Use:

```bash
bun run materialize:problem9-prompt-package -- \
  --output <prompt-root> \
  --benchmark-package-root <working-root>/firstproof/Problem9 \
  --run-id <run-id> \
  --attempt-id <attempt-id> \
  --lane-id <lane-id> \
  --run-mode <mode> \
  --tool-profile <profile> \
  --provider-family <family> \
  --auth-mode <mode> \
  --model-config-id <id> \
  --harness-revision <revision>
```

This writes the canonical reviewable prompt package:

- `prompt-package.json`
- `system.md`
- `benchmark.md`
- `item.md`
- `run-envelope.json`

The prompt package is the repository-owned input contract for a single offline
attempt.

## Required local working assumptions

The current offline spine assumes:

- package materialization happens outside the checked-in benchmark source tree
- prompt-package output does not overlap either the benchmark package root or
  the checked-in prompt templates
- provider credentials follow the local-versus-hosted secret-injection rules
  already defined for worker execution
- the selected lane, model config, auth mode, and harness revision are pinned
  in the prompt package before provider execution begins

## What is still missing before #377 can close

The umbrella delivery issue is not done until the repository owns one local
command that performs the whole offline sequence:

- benchmark-package materialization
- prompt-package materialization
- provider execution and bounded repair
- authoritative Lean and verifier execution
- canonical run-bundle emission
- optional structured ingest after bundle finalization

The missing implementation is not another frontend or portal scope document.
It is the repository-owned local runner that stitches the already-resolved
contracts into one concrete command.

## Sequencing consequence

Until that local runner exists, broader portal, public-reporting, and admin UX
expansion should remain deferred behind the Problem 9 offline spine.

This document is the source of truth for what the current repository-backed
spine includes and what still blocks full umbrella completion.
