# Hosted Worker Modal Topology Baseline

This document defines the concrete Modal topology ParetoProof should operate for hosted workers.

The goal is to replace vague "run it on Modal" guidance with one accepted runtime layout covering workspace ownership, environment boundaries, app structure, pool mapping, region posture, and network shape.

## Decision

ParetoProof should operate hosted workers inside one ParetoProof-owned Modal workspace with three long-lived environments:

- `dev`
- `staging`
- `prod`

Within each environment, every control-plane worker pool maps to its own dedicated Modal worker app. That app is the rollout, autoscaling, and incident boundary for the pool in that environment.

The accepted topology is therefore:

1. one operator-owned Modal workspace for the product
2. one long-lived Modal environment per release stage
3. one environment-local Modal app per worker pool
4. one digest-pinned deployment history per app
5. many short-lived worker runtime instances underneath each deployment

Hosted worker topology must stay machine-only and control-plane-owned. Browser traffic, contributor identities, and public reporting never terminate inside Modal worker apps.

## Workspace ownership

The authoritative hosted fleet should live in one shared Modal workspace owned by ParetoProof operators, not in personal developer workspaces and not split across unrelated org spaces.

That workspace is the only place where production-relevant worker apps, environments, secrets, and rollout history may exist.

This means:

- contributor or personal Modal workspaces are allowed only for throwaway experiments
- personal workspaces are never evidence for staging or production readiness
- promotion, incident review, and drift checks only trust the ParetoProof-owned workspace
- workspace-level operator access should stay limited to owners or the small admin set responsible for hosted execution

The workspace is an infrastructure trust boundary, not a collaboration surface.

## Environment model

ParetoProof should use exactly three long-lived Modal environments:

### `dev`

`dev` is the integration environment for active implementation, schema evolution, and low-risk validation against non-production control-plane data and non-production secrets.

It may run reduced pool counts or lower capacity caps, but it should still use the same topology shape as higher environments.

### `staging`

`staging` is the pre-production proving ground.

It should mirror the production worker topology closely enough that rollout, secret wiring, worker registration, and artifact flow can be proven without inference.

Anything that cannot survive staging with the same topology assumptions is not ready for production.

### `prod`

`prod` is the only environment allowed to process production hosted launches or hold production provider credentials.

Production changes must arrive through explicit promotion from known-good staged assets rather than ad hoc environment edits.

## Environment rules

The environment split is strict:

- no production worker app may read secrets from `dev` or `staging`
- no staging proof may rely on personal or preview Modal environments
- no ephemeral per-PR or per-branch Modal environments are part of the MVP hosted topology
- if a pool is not explicitly provisioned in an environment, the control plane must treat that pool as unavailable there

This keeps topology drift visible and keeps release evidence tied to stable runtime objects.

## App and deployment structure

The Modal app boundary should match the control-plane worker-pool boundary.

For each worker pool `workerPool`, ParetoProof should operate one app per environment named with a stable convention such as:

- `paretoproof-worker-dev-<workerPool>`
- `paretoproof-worker-staging-<workerPool>`
- `paretoproof-worker-prod-<workerPool>`

Each app owns:

- one supervised worker entrypoint for that pool
- that pool's environment-scoped secrets and machine credentials
- that pool's runtime resource class and autoscaling settings
- that pool's deployment history and rollback target

The app should not multiplex unrelated pools behind one shared scaling boundary. Pool-level drain, rollback, budget, and incident posture are first-class operational domains, so they need first-class runtime objects too.

Under each app:

- deployments are immutable rollout revisions pinned to one worker image digest plus one approved config set
- runtime instances are the short-lived containers or processes created from that deployment during scaling

Operators should reason about "pool app in environment" as the durable unit, not about one giant multi-pool worker app.

## Worker-pool mapping

The canonical mapping is:

- one control-plane `worker_pool` maps to one Modal app in one environment
- one pool may exist in multiple environments, but each environment owns its own separate app and secrets
- pool names stay environment-independent in the control plane; the Modal app name adds the environment prefix
- queue eligibility, drain state, and lease policy still live in the API, not in Modal

This gives ParetoProof clean answers to the questions operators actually need to ask:

- which pool is unhealthy
- which environment is affected
- which deployment digest is running there
- which secrets and capacity limits apply there

It also avoids accidental coupling where one pool rollout or incident drags a second pool with it.

## Region posture

ParetoProof should run the hosted fleet in one primary Modal region aligned with the control plane's primary data region for MVP.

The region choice should minimize round-trip latency to:

- the Railway-hosted API
- the primary Neon database region
- the artifact-storage region used for signed uploads and downloads
- the supported provider endpoints that hosted workers call directly

The important policy decision is not the literal cloud label but the topology rule:

- `dev`, `staging`, and `prod` should all target the same primary geography unless an explicit later scope approves multi-region operation
- production should not silently spread pools across multiple regions
- staging should prove the same region strategy that production will use

Multi-region failover, regional sharding, and active-active hosted fleets are out of scope for MVP and require a later dedicated scope because they would change pool identity, budget policy, rollout evidence, and incident handling.

## Network posture

Hosted worker apps should be outbound-only compute surfaces. They are not public web apps and should not expose a general inbound HTTP API as part of normal operation.

The accepted network posture is:

- workers call out to `api.paretoproof.com/internal/*` for registration, claim, heartbeat, artifact, and finalize flows
- workers call only the approved provider endpoints needed for supported hosted execution
- workers use short-lived signed artifact transfer URLs issued by the control plane when they must move bytes
- operators use the control plane and portal for fleet actions instead of talking directly to Modal worker apps

The topology explicitly rejects:

- browser-to-Modal worker traffic
- public ingress routes as a normal worker control path
- ad hoc debug endpoints that bypass the API audit trail
- hidden side channels for artifact upload or provider calls

Detailed egress allowlists and secret-exfiltration rules belong to `#929`, but the topology baseline already fixes the architectural rule that Modal workers are dark compute nodes behind the API.

## Deployment posture

Deployment topology should follow the environment and pool boundaries above:

- promote by deploying a new digest-pinned revision to the target pool app in `staging`
- prove staging on that exact app and environment shape
- promote the approved revision into the corresponding `prod` pool app
- roll back by selecting the prior known-good deployment revision for that same pool app

Operators should not create new production app names during an ordinary rollout. Rollout changes the deployment revision inside the known pool app; it does not redefine the topology on the fly.

Detailed rollout evidence and release-packet rules belong to `#920`, but this baseline fixes the runtime object that those later rules act on.

## Topology drift policy

Hosted-worker topology should fail closed when the control plane and Modal disagree about the expected runtime layout.

Examples of drift that must be treated as actionable:

- a pool exists in the API but no matching Modal app exists in the target environment
- a production pool app is pointed at an unexpected environment or region
- one app is serving multiple control-plane pools
- a worker app exposes unexpected ingress behavior
- staging and production pool topologies diverge in ways the release evidence does not explain

Later drift-detection automation should compare the expected workspace, environment, app, and deployment map against the live Modal inventory rather than relying on operator memory.

## Naming and operator expectations

The topology should stay legible in both the control plane and the Modal UI.

Operators should be able to answer all of these from the app name and environment alone:

- which release stage this worker belongs to
- which control-plane pool it serves
- whether it is allowed to process production work

That is why environment and pool identity belong in the stable app name instead of hiding behind one generic worker label.

## Consequences for follow-up execution

This baseline directly shapes the next infrastructure and worker issues:

- `#907` should provision one shared workspace plus the canonical `dev`, `staging`, and `prod` environments
- `#907` and `#930` should create or validate one app per pool per environment, not one monolithic worker app
- `#908`, `#931`, and `#932` should assume pool identity is already reflected in the runtime object they target
- `#920` should treat the per-pool app deployment history as the rollout and rollback anchor
- `#929` should define the exact allowed egress set for these otherwise dark worker apps

## Out of scope

This scope does not:

- provision the Modal objects yet
- define the bootstrap-token or per-job token lifecycle in detail
- define the provider capability matrix or provider-specific secret policy
- define the exact autoscaling algorithm or capacity thresholds
- define the detailed rollout checklist or release packet

It defines the Modal runtime topology those later scopes and execution issues must honor.
