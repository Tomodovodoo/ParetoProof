# Hosted Worker Rollout And Release Baseline

This document defines how hosted worker images move from build output to staging proof to production rollout.

The goal is to make hosted-worker promotion and rollback evidence-based and digest-based instead of relying on mutable tags, operator memory, or "CI was green at some point."

## Decision

ParetoProof should promote hosted worker rollouts by immutable image digest, not by mutable tag.

The accepted hosted release path is:

1. prove the exact PR head through the required pre-merge `Pull Request CI / ci` worker/image/runtime steps
2. merge to `main`
3. obtain the published worker image digest from the owning publish workflow artifact
4. deploy that exact digest to the matching `staging` worker-pool apps
5. record staging verification evidence against that exact digest
6. promote the same digest into the corresponding `prod` worker-pool apps
7. record production release evidence, including rollback readiness to the prior known-good digest

Rollout is therefore a digest-promotion ceremony across environments, not a retagging convention and not a "latest main image" guess.

## Authoritative image identity

The authoritative identity for a hosted worker release is the published image digest recorded by the owning workflow artifact and step summary.

For the current repository-owned image graph that means:

- `problem9-execution` and `paretoproof-worker` digests come from the `Publish Problem 9 Execution and Worker Images` workflow and the `problem9-image-digests` artifact
- `problem9-devbox` digest comes from the `Publish Problem 9 Devbox Image` workflow and the `problem9-devbox-image-digest` artifact, but that image is not the hosted production worker rollout target

Mutable tags such as `main` are convenience locators. They are not the release authority for hosted promotion, provenance review, or rollback.

## Hosted rollout target

The hosted rollout target for the Modal fleet is the published `paretoproof-worker` image digest.

That digest is deployed into the environment-local worker-pool apps defined by the hosted topology baseline.

`problem9-execution` remains relevant as:

- the canonical non-interactive execution environment in the image graph
- part of the build and publish evidence chain
- a coupled image whose digest should stay traceable in the release packet when the worker wrapper is published from the same workflow

But the object being rolled out to hosted worker apps is the hosted worker image digest used by those apps.

## Promotion boundary

Hosted promotion has two distinct evidence stages:

### 1. Pre-merge promotion gate

Before merge, the PR head must pass the exact worker/image/runtime proof gates documented in [`runtime.md`](./runtime.md).

For hosted-worker-adjacent slices this means the exact PR head must show:

- `Build Problem 9 execution image smoke target`
- `Verify Problem 9 execution image smoke target`
- `Build Problem 9 devbox image smoke target`
- `Verify Problem 9 devbox image smoke target`
- `Run deterministic Problem 9 verifier smoke`
- `Run deterministic Problem 9 local-stub attempt smoke`
- any coupled auth or runtime checks required by the touched slice

This is the gate that proves the candidate change is fit to merge. It is not replaced by post-merge publishing.

### 2. Post-merge release evidence

After merge, the owning publish workflow records the digest that can actually be promoted through hosted environments.

This is the gate that proves:

- which immutable image was published
- which digest staging and production must use
- what exact prior digest is available for rollback comparison

Hosted rollout must cite both evidence stages:

- pre-merge PR smoke proof on the exact merged head
- post-merge published digest artifact for the exact released image

## Staging-first requirement

Every production hosted rollout must pass through `staging` first.

The accepted rule is:

- deploy the target digest to the matching `staging` pool apps
- prove staging against those exact apps and that exact digest
- only then promote that same digest to `prod`

Production may not jump directly from "published on GHCR" to "running in prod" without a staging proof packet unless a later dedicated emergency policy explicitly defines a break-glass path.

## Digest pinning rules

Hosted worker deployments must pin the full immutable digest in the deployment record.

That means:

- operator rollout requests should identify the target digest explicitly
- staging and production deployment records should preserve the deployed digest explicitly
- pool detail and rollout detail read models should surface that digest to operators
- rollback must target a prior digest, not "the previous main tag"

Any deployment mechanism that resolves a mutable tag at deployment time without preserving the resulting digest is out of bounds.

## Environment rollout sequence

The canonical hosted rollout sequence is:

1. identify the merged commit and the published `paretoproof-worker` digest from the publish workflow artifact
2. verify that the digest corresponds to the intended merged revision and image policy entry
3. deploy the digest to the target `staging` pool app or pool-app set
4. run the required staging verification and record the observed results
5. if staging passes, promote the same digest to the corresponding `prod` pool app or pool-app set
6. record the production release packet and the rollback-ready prior digest

The critical constraint is sameness:

- the digest proven in staging must be the digest promoted to production
- changing secrets, config, or image at the same time must be explicit and separately recorded

## Rollout unit

The rollout unit is the environment-local worker-pool app defined in the hosted Modal topology baseline.

That means:

- a rollout may affect one pool or multiple pools
- each affected pool must still preserve its own before/after digest state
- blocked or partially promoted pools must remain visible as such in rollout evidence

This avoids turning "the fleet" into one opaque release blob.

## Rollback rule

Rollback must also happen by digest.

The accepted rollback sequence is:

1. identify the prior known-good digest from the most recent successful release evidence
2. confirm that digest is still valid for the intended pool, environment, and credential posture
3. redeploy or reselect that prior digest for the affected app or apps
4. record the rollback reason, operator, affected environments, and restored digest
5. run the required post-rollback verification and attach it to the incident or release packet

Rollback may not assume that a mutable tag still points at the prior good build.

## Rollback readiness requirement

Every production promotion must record rollback readiness before or at the time of promotion.

That readiness packet must include:

- target digest
- previous known-good digest
- affected pool apps
- environment
- credential or secret posture relevant to the rollout
- blocking conditions that would prevent a clean rollback

If the release packet cannot identify a credible rollback target, the rollout is not ready for production.

## Release evidence packet

Each hosted production rollout should produce one durable release packet or equivalent record containing at least:

- merged commit sha
- PR number
- target digest for the hosted worker image
- any coupled execution-image digest recorded by the same publish workflow
- target environment and affected pools
- staging verification evidence
- production promotion timestamp
- prior known-good digest
- rollback readiness or rollback execution note
- operator or system actor that approved the promotion

This packet should be the artifact operators and reviewers read later, not a reconstruction exercise across scattered workflow logs.

## Minimum staging verification evidence

The staging packet should show enough evidence to prove the hosted worker path, not just that a deploy command succeeded.

The required staging proof should include:

- the exact deployed digest
- the exact target pool apps and environment
- proof that workers registered under the expected version/digest posture
- proof that claim, heartbeat, and terminal finalize still work on the staged digest
- proof that the supported hosted provider posture still works for the staged digest
- proof that artifact registration and upload flows still match the control-plane contract

Later scope `#927` will define the deeper staging smoke and chaos suite. This scope fixes that staging proof is mandatory and digest-specific.

## Blockers to production promotion

Production promotion must be blocked when any of these are true:

- the PR head did not pass the required pre-merge smoke evidence
- the publish workflow did not emit the authoritative digest artifact
- staging was not run against the exact target digest
- staging evidence is missing, ambiguous, or tied to a different digest
- the previous known-good digest is unknown
- required worker, provider, or secret posture changed without explicit release evidence
- operator evidence shows unresolved incidents or rollout blockers for the target pool

Green generic CI alone is not enough.

## Partial rollout posture

If only some pools are promoted or some pools fail staging or production:

- the rollout record must show which pools advanced and which did not
- blocked pools must remain on their prior digest until explicitly promoted or rolled back
- operators must not collapse partial rollout state into one misleading fleet-wide "success"

This is especially important once multiple worker pools exist with different capability or budget envelopes.

## Secret and config coupling

Hosted worker rollouts often depend on more than the image digest alone.

If a rollout also changes:

- bootstrap credential family
- provider credential material
- pool config
- runtime resource class
- environment-scoped secret names or references

then the release evidence must record that coupling explicitly.

The digest remains the deployment anchor, but operators still need to know whether the rollout changed only the image or also changed the secret/config posture around it.

## Relationship to current image policy

This rollout baseline extends the existing Problem 9 image policy; it does not replace it.

The image policy already fixes:

- the published image names
- mutable and immutable tagging rules
- owning workflows
- digest evidence artifacts
- rollback by digest as the operator rule

This hosted rollout scope adds the missing environment-promotion contract on top:

- staging-first proof
- production promotion gate
- release packet contents
- per-pool rollout and rollback evidence

## Relationship to other scopes

This rollout baseline depends on and complements the surrounding hosted-worker scopes:

- `#917` defines the Modal app topology that receives the promoted digest
- `#918` defines the credential and token posture that may change alongside a rollout
- `#919` defines the provider-family and hosted credential posture the rolled image must honor
- `#921` and `#922` will define pool behavior and lifecycle consequences during rollout and recovery
- `#924`, `#925`, and `#926` define the observability, runbook, and operator UI surfaces that should expose rollout evidence
- `#927` defines the deeper staging smoke, chaos, and disaster-recovery verification suite that production promotion must eventually cite

## Consequences for follow-up execution

This baseline should directly shape the next execution issues:

- `#909` should deploy hosted worker apps by explicit digest and preserve per-environment rollback targets
- `#913` should capture the staging and production verification packet against the exact deployed digest
- operator rollout read models should expose current digest, target digest, previous digest, and rollout blocker state
- later rollback automation should consume the recorded prior digest instead of inferring from tags

## Out of scope

This scope does not:

- implement the Modal rollout automation
- redefine the Docker target graph or image manifest
- define the complete staging smoke or chaos suite in detail
- define the exact operator UI for rollout controls

It defines the hosted worker promotion, digest-pinning, rollback, and release-evidence contract those later execution issues must honor.
