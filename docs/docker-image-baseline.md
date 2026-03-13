# Offline Problem 9 Devbox and Execution Image Policy

This document defines the MVP image policy for the offline `firstproof/Problem9` slice. The goal is to support one defensible local benchmark kernel now without locking ParetoProof into the wrong long-term worker shape.

The policy intentionally distinguishes between:

- a trusted local devbox image used by contributors to materialize the benchmark package, run local harness commands, and use interactive tools such as Codex CLI and `lean-lsp-mcp`
- a narrower execution image used for benchmark-verdict runs and as the direct parent for later worker images

That split keeps the local workflow practical while preserving a clean migration path toward non-interactive worker execution.

## Policy summary

- MVP starts with both a local/offline devbox image and a separate benchmark execution image.
- The devbox is the default contributor environment for the Problem 9 slice.
- The execution image is the canonical verdict environment and the base contract for later worker images.
- the required Lean lanes are defined in `lean-mathlib-version-baseline.md`
- Lean `4.26.0` and `4.28.0` are experiment-only lanes and are excluded from required CI and canonical verdicts.
- Python `3.11` is required in the devbox for Aristotle-adapter compatibility, but not in the MVP execution image.
- Node `22` is the only supported runtime for harness execution.
- Bun remains a monorepo install and build tool, not the runtime authority for benchmark verdicts.
- All images must stay secret-free and reproducibility-oriented.

## Image targets

The repository should treat the Problem 9 image family as two named targets derived from one pinned build definition:

- `problem9-devbox`: broader local image for trusted interactive use
- `problem9-execution`: narrower runtime image for canonical benchmark runs

The two targets should share the same pinned base OS family and verifier toolchain policy so a devbox-produced result can be rerun in the execution target without semantic drift caused by a different foundation.

## Devbox target (`problem9-devbox`)

The devbox exists to support trusted local iteration on the offline slice. It is allowed to include interactive tooling that would be inappropriate in a hosted worker image, but those tools still operate under local runtime-mounted auth only.

### Base and system packages

- base image family: Debian Bookworm with Node `22`
- required system packages:
  - `ca-certificates`
  - `curl`
  - `git`
  - `openssh-client`
  - `python3.11`
  - `python3.11-venv`
  - `python3-pip`
  - `unzip`
  - `xz-utils`
  - `zstd`
  - build helpers only if required by pinned verifier or adapter dependencies

### Required toolchains and tools

- Bun `1.3.10` for monorepo install/build commands
- `elan`
- Lean `4.22.0`
- Lean `4.24.0`
- pinned Lake and Mathlib snapshots resolved from the benchmark package and committed manifests
- Codex CLI for trusted local interactive runs only
- `lean-lsp-mcp` for local proof-state inspection and Lean-assisted workflows
- verifier tooling required to prove:
  - no `sorry` or `admit`
  - theorem-target equality checks
  - axiom allowlist enforcement
  - compiler-diagnostic gating

### Benchmark package handling

The devbox should be able to materialize the immutable `firstproof/Problem9` benchmark package from a pinned repository snapshot, archive, or digest-defined local source. The package version remains a distinct reproducibility axis from the image digest itself.

The devbox may cache the benchmark package locally for speed, but benchmark inputs must be mounted or copied into the execution sandbox as read-only material. Editing the canonical package in place is not part of the allowed workflow.

## Execution target (`problem9-execution`)

The execution image is the canonical environment for benchmark verdicts. It should stay narrower than the devbox and be suitable for later reuse by local Docker runs, CI verifier jobs, and future worker execution.

### Base and system packages

- base image family: Debian Bookworm slim with Node `22`
- required system packages:
  - `ca-certificates`
  - `curl`
  - `git`
  - `xz-utils`
  - `zstd`

### Required toolchains and runtime contents

- `elan`
- Lean `4.22.0`
- Lean `4.24.0`
- pinned Lake and Mathlib state for the selected benchmark package version
- verifier binaries and scripts needed for strict offline verdicts
- the immutable benchmark package snapshot for the selected `firstproof/Problem9` version, or a deterministic materialization step that resolves to the same pinned contents before execution starts
- built TypeScript or Node harness code needed to run the offline loop

### Explicit exclusions

- Bun as a runtime dependency
- Python and Python-based adapter stacks
- Codex CLI
- `lean-lsp-mcp`
- browser runtimes
- interactive shell tooling that is not required for benchmark execution

This image should be capable of replaying the canonical offline run with machine-authenticated providers or provider stubs, but it should not depend on trusted interactive user auth.

## Lean lane policy

The image policy follows `lean-mathlib-version-baseline.md`.

For MVP, the image contract is:

- the devbox must include the two required lanes: `lean422_exact` and `lean424_interop`
- the execution image must also include those same two required lanes
- experiment lanes such as `lean426_experiment` and `lean428_experiment` are optional and must not become required merge gates by image drift alone

This document does not decide which lanes exist or when they change. It only requires the image family to carry the lanes that the version-policy baseline marks as required.

## Python policy

Python is required only in the devbox target for MVP, with minimum supported version `3.11`.

Rationale:

- Aristotle adapter work may require Python in trusted local development before the machine-auth execution path is fully stabilized.
- forcing Python into the canonical execution image would widen the benchmark-verdict surface before the adapter contract is settled in issue `#43`
- keeping Python out of the execution image preserves a narrower worker-image baseline for later hosted execution

If a future non-interactive execution path truly depends on Python, that should be introduced as a follow-up image-policy update with an explicit package list and runtime justification.

## Node and Bun policy

Node `22` is the only supported runtime for harness execution in both the devbox and the execution target.

Bun is allowed only for repository tooling:

- dependency installation
- workspace builds
- local script orchestration where Node runtime compatibility is not the authority being tested

Benchmark verdicts, verifier invocations, and emitted result bundles must be reproducible under the Node-based execution target, not merely under a developer's Bun-powered shell workflow.

## Reproducibility tuple

Every canonical offline Problem 9 result must be attributable to one explicit tuple:

- benchmark package version or digest
- lane id (`lean422_exact` or `lean424_interop`)
- Lean toolchain version
- Mathlib or Lake dependency snapshot
- verifier version
- harness revision
- model configuration id and provider snapshot metadata
- execution image digest

The devbox digest may be recorded for contributor traceability, but the execution image digest is the authoritative environment identifier for benchmark verdicts.

## Auth and secret boundary

No image may contain:

- provider API keys
- ChatGPT or Codex auth caches
- SSH keys
- GitHub, Railway, Neon, Cloudflare, Modal, or R2 credentials
- long-lived database credentials
- environment-specific `.env` files
- contributor-specific shell history, MCP caches, or editor state

Trusted local Codex or provider auth is allowed only as a runtime mount or local environment injection into the devbox. It is not allowed in committed Dockerfiles, build args, copied files, image layers, or published cache artifacts.

The execution image must assume non-interactive auth only. If a provider cannot be used without a human-authenticated local session, that path belongs in the devbox workflow and is not the canonical benchmark-verdict path.

## Boundary between devbox and later worker images

The devbox is a contributor tool. The execution image is the contract that later worker images inherit.

That means:

- benchmark-verdict rules must be valid in the execution image without relying on devbox-only tools
- future Modal or container workers may derive from `problem9-execution` or reproduce its contents exactly
- devbox-only conveniences must not become hidden benchmark dependencies

The migration rule is simple: if removing an interactive tool from the devbox would change benchmark correctness, then that tool belongs in the execution image or the verifier contract instead of remaining a local-only convenience.

## Out of scope

- final provider framework API details from issue `#43`
- final agent-loop stop conditions from issue `#44`
- final reproducibility schema fields from issue `#34`
- hosted worker deployment mechanics beyond the execution-image contract
