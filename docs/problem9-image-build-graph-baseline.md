# Problem 9 Image Build Graph Baseline

This document defines the authoritative Docker target graph for the offline `firstproof/Problem9` slice and the later hosted worker image that reuses it.

The goal is to turn the already-approved image policy into one concrete build graph that execution issues can implement without reopening the devbox-versus-execution split from [docker-image-baseline.md](docker-image-baseline.md).

## Scope of this baseline

This baseline owns:

- the named Docker targets for the Problem 9 image family
- which targets are intermediate cache layers versus published runtime images
- which inputs should invalidate each layer
- the GHCR repository and tag strategy for published images
- which CI or publish workflows build, validate, or publish each target

This baseline does not own:

- the detailed package list inside each image target
- worker runtime semantics, lease policy, or CLI flags
- queue scheduling or job orchestration behavior
- implementation of the Dockerfile or workflow changes themselves

## Core decision

ParetoProof should use one repository-owned multi-stage Docker build graph for the Problem 9 slice, with three published runtime images and a small number of unpublished shared targets:

- unpublished shared targets:
  - `problem9-os-base`
  - `problem9-toolchain-base`
  - `problem9-app-build`
  - `problem9-benchmark-base`
- published runtime targets:
  - `problem9-execution`
  - `problem9-devbox`
  - `paretoproof-worker`

The important constraint is that `problem9-devbox` and `paretoproof-worker` both derive from the same `problem9-execution` contract rather than from two unrelated Dockerfiles.

## Authoritative target graph

The canonical graph is:

- `problem9-os-base`
  - pinned Debian Bookworm family
  - Node `22`
  - only system packages shared by every later target
- `problem9-toolchain-base`
  - extends `problem9-os-base`
  - installs `elan`, required Lean lanes, and verifier prerequisites
  - contains no repository source and no benchmark package contents
- `problem9-app-build`
  - build stage only
  - installs workspace dependencies and compiles `packages/shared` plus `apps/worker`
  - not a runtime image and not a parent for interactive tooling decisions
- `problem9-benchmark-base`
  - extends `problem9-toolchain-base`
  - adds the immutable `firstproof/Problem9` benchmark package or its deterministic materialized equivalent for the selected package version
- `problem9-execution`
  - combines `problem9-benchmark-base` with the built worker and harness runtime output from `problem9-app-build`
  - is the canonical verdict environment and the reusable parent for later runtime images
- `problem9-devbox`
  - extends `problem9-execution`
  - adds trusted-local interactive tooling such as Bun, Python `3.11`, Codex CLI, `lean-lsp-mcp`, and contributor shell conveniences
- `paretoproof-worker`
  - extends `problem9-execution`
  - adds only the hosted worker wrapper defaults needed for `run-worker-claim-loop` and similar non-interactive runtime entrypoints

Expressed another way:

- `problem9-toolchain-base` defines the pinned Lean and verifier foundation
- `problem9-execution` defines the benchmark-verdict environment
- `problem9-devbox` is a broader local shell on top of the verdict environment
- `paretoproof-worker` is a narrower service wrapper on top of the same verdict environment

## Why the graph is shaped this way

This graph enforces four rules:

1. Canonical benchmark semantics live in `problem9-execution`, not in the devbox and not in the hosted wrapper image.
2. Devbox-only conveniences may widen the local shell, but they must not become hidden benchmark dependencies.
3. Hosted workers may change entrypoint or service glue, but they must not silently fork the underlying Lean, benchmark, or verifier environment.
4. The repository should rebuild only the layer family that actually changed instead of invalidating every image for every code edit.

## Cache and invalidation boundaries

The build graph should invalidate by responsibility.

### `problem9-os-base`

Invalidate only when:

- the pinned base image family changes
- the shared system package list changes

This target should be stable across worker-code edits.

### `problem9-toolchain-base`

Invalidate when:

- required Lean lanes change
- verifier prerequisite packages change
- pinned toolchain bootstrap logic changes

This target should not rebuild just because application code changed.

### `problem9-app-build`

Invalidate when:

- `apps/worker/**` changes
- `packages/shared/**` changes
- root workspace dependency manifests or lockfiles change
- worker-build tooling changes

This target is allowed to rebuild frequently and should be the main application-code cache boundary.

### `problem9-benchmark-base`

Invalidate when:

- the benchmark package source or materialization logic changes
- the selected benchmark package version changes
- the canonical benchmark package manifest changes

This keeps benchmark-package drift separate from worker-code drift.

### Final runtime targets

- `problem9-execution` invalidates when either `problem9-benchmark-base` or `problem9-app-build` changes
- `problem9-devbox` invalidates when `problem9-execution` changes or devbox-only tool choices change
- `paretoproof-worker` invalidates when `problem9-execution` changes or the hosted worker wrapper configuration changes

Intermediate targets should use BuildKit cache reuse. They do not need their own public GHCR tags.

## Published image set

The published image family should be:

- `ghcr.io/<owner>/paretoproof-problem9-execution`
- `ghcr.io/<owner>/paretoproof-problem9-devbox`
- `ghcr.io/<owner>/paretoproof-worker`

The first two names make the Problem 9 scope explicit. The third keeps the existing worker image name because it is the later deployment-facing service image.

The repository should not publish `problem9-os-base`, `problem9-toolchain-base`, `problem9-app-build`, or `problem9-benchmark-base` as stable external runtime contracts. Those are implementation layers, not operator-facing artifacts.

## Tag and digest strategy

Published images must follow one simple rule:

- mutable tags are convenience pointers
- digests are the authoritative identity

### Required tags

Every published image should receive:

- `sha-<git_sha>`
- `main` when built from the default branch head

These tags should exist for:

- `paretoproof-problem9-execution`
- `paretoproof-problem9-devbox`
- `paretoproof-worker`

Additional release or environment tags may be added later, but they are not part of the MVP baseline.

### Digest rules

- workflow outputs must capture the pushed manifest digest for every published target
- downstream deploy or run configuration must pin by digest, not by `main`
- the digest recorded in run-bundle environment metadata for canonical execution should be the digest of `problem9-execution`

That last rule matters because `paretoproof-worker` is an orchestration wrapper around the canonical verdict environment. Hosted deployment records may also track the outer worker-image digest, but benchmark reproducibility should remain anchored to the execution-image digest.

## Workflow ownership

The build graph should be consumed by three workflow classes.

### 1. Pull-request validation workflow

The normal PR `ci` workflow should build the Docker targets in validation mode only. It must not push images.

Its responsibility is:

- validate that the shared Docker graph still builds
- catch Dockerfile or workspace regressions before merge
- prove that `problem9-execution` and `paretoproof-worker` remain buildable from a clean checkout

If CI cost forces a narrower first step, `problem9-execution` is the minimum required validation target because it is the benchmark-semantic parent of both the devbox and worker images.

### 2. Main-branch execution and worker publish workflow

The existing worker publish workflow should become the authoritative publisher for:

- `paretoproof-problem9-execution`
- `paretoproof-worker`

Those two images belong in one publish workflow because:

- they share the same graph and cache boundary
- worker publication without an updated execution image creates traceability ambiguity
- the worker image is not supposed to drift semantically from the execution contract it wraps

This workflow should push both images on `main` changes that affect the worker/image slice and should emit both resulting digests.

### 3. Manual devbox publish workflow

`paretoproof-problem9-devbox` should not be published on every worker-code merge by default.

Its publication should belong to a separate owner-triggered or explicitly dispatched workflow because:

- the devbox is larger and more contributor-facing than the canonical execution image
- trusted-local tooling changes do not always need a fresh published devbox artifact
- the devbox is not the benchmark-verdict authority

That workflow may still build from the same Dockerfile target graph, but its publish cadence should be manual or at least more selective than the execution-and-worker publish path.

## Local build-command ownership

The repository should eventually expose three explicit local build entrypoints that map directly onto the graph:

- build `problem9-execution`
- build `problem9-devbox`
- build `paretoproof-worker`

Local commands should target named Docker stages directly instead of duplicating separate Dockerfiles or hidden build scripts per image family.

The important rule is that a contributor should be able to say "build the execution image" and get the same semantic target the publish workflow uses, even if the local command skips registry push.

## Relationship to worker runtime modes

This baseline aligns with [worker-runtime-modes-baseline.md](worker-runtime-modes-baseline.md):

- `problem9-devbox` is the trusted-local container for `artifact_materialization` and `local_single_run`
- `problem9-execution` is the canonical environment that `local_single_run` and hosted execution must share
- `paretoproof-worker` is the hosted-image wrapper for `hosted_claim_loop`

Offline ingest is intentionally outside the image-graph decision except to the extent that it may run against `problem9-execution` locally.

## Relationship to reproducibility tracking

This baseline aligns with [problem9-reproducibility-baseline.md](problem9-reproducibility-baseline.md):

- canonical run bundles keep `executionTargetKind` anchored to the semantic environment
- for image-backed canonical runs, `executionImageDigest` should refer to `problem9-execution`
- local trusted-interactive runs may continue to record a `problem9-devbox` digest when the devbox is the actual execution target

Hosted worker deployment metadata may track both the worker wrapper digest and the execution digest, but only the execution digest is part of the canonical benchmark-verdict environment identity.

## Follow-up execution framing

This baseline should produce at least three execution issues:

- align `apps/worker/Dockerfile` to the approved target graph and named stages
- update image-publish workflows and cache strategy for execution plus worker publication
- document or script local build commands for execution, devbox, and worker targets

## Out of scope

- exact Dockerfile instructions or package-manager commands
- benchmark scheduler behavior
- Modal job-launch details
- future non-Problem 9 image families
