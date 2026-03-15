# Hosted Worker Platform Baseline

This document defines the full product and operations baseline for ParetoProof's hosted worker platform on Modal.

The goal is to stop the hosted path from remaining a collection of individually plausible pieces such as images, a claim loop, provider keys, and portal fixture views without one accepted system model tying them together.

## Current baseline

The repository already has meaningful hosted-worker kernel pieces:

- a published hosted worker image target and a narrower `paretoproof-worker` wrapper image
- a hosted claim loop in `apps/worker` that talks to the internal worker API
- canonical run, job, attempt, artifact, and worker-control contracts in `@paretoproof/shared`
- startup validation and PR-CI smoke coverage for worker, image, and auth boundaries
- runtime rules that already distinguish trusted-local, hosted, and offline-ingest modes
- a private portal worker and run-ops surface, even though much of its fleet data is still fixture-driven

What is still missing is one accepted answer to:

- what Modal objects ParetoProof actually operates
- which credentials hosted workers are allowed to hold
- how pools, leases, artifacts, rollout, and incidents fit into one control model
- what operators must be able to see and prove before promoting hosted execution

Without that baseline, implementation work will drift into environment folklore and one-off infrastructure choices.

## Decision

ParetoProof should treat hosted execution as one control-plane-owned worker platform with Modal as the runtime substrate, not as a browser-adjacent convenience path and not as a direct provider-client shortcut.

The accepted platform shape is:

1. the API control plane owns job truth, authorization, worker identity, queue state, and artifact policy
2. Modal owns isolated runtime slots that run a supervised worker image and call back into the control plane
3. hosted workers authenticate only with machine credentials issued or approved by the control plane
4. provider secrets, artifact upload rights, and rollout policy are environment-scoped operator assets, never browser assets
5. portal and public surfaces consume read models derived from control-plane records, not direct Modal or provider state

Hosted workers are therefore a managed execution fleet behind the API, not an alternate product surface.

## Platform responsibilities

### API control plane

The control plane remains the authority for:

- launch acceptance and queue creation
- worker registration, heartbeat, lease issue, drain, and recovery decisions
- bootstrap-token and per-job token validation
- artifact registration, upload intent issuance, quarantine, and release posture
- operator audit records, incident state, and publication-safe reporting

Hosted runtimes are not allowed to invent queue state locally or bypass control-plane lifecycle decisions.

### Modal runtime

Modal provides:

- environment-separated runtime execution
- image deployment targets for supervised workers
- secret injection for environment-approved machine credentials
- autoscaling and worker-process placement primitives
- runtime logs and health signals that feed the control plane and operator evidence

Modal is execution substrate, not source of truth.

### Portal and public surfaces

The portal owns:

- worker fleet posture
- run-ops controls
- operator incident and rollout evidence views
- later admin workflows for drain, requeue, and release decisions

The public site owns only released, redaction-safe reporting derived from control-plane release objects. It does not inspect fleet state directly.

## Canonical hosted execution flow

Hosted execution should follow this sequence:

1. a portal or internal launch creates durable queued work in the control plane
2. an environment-approved hosted worker instance starts on Modal and proves worker identity to the API
3. the worker claims one job lease from the internal worker surface
4. the API issues scoped job credentials and the worker materializes the exact benchmark and prompt package inputs
5. the worker executes the attempt inside an isolated workspace, emits heartbeats and events, and registers artifacts against the attempt
6. artifact bytes upload through API-authorized direct object-storage intents rather than through browser or provider side channels
7. the worker submits terminal success or failure with canonical evidence references
8. the control plane finalizes attempt, job, and run state and exposes private and public read models according to release policy

Any hosted path that skips the API as the durable authority is out of bounds.

## Runtime boundary

Hosted workers are machine-only execution environments.

They may hold:

- a bootstrap credential or equivalent environment-scoped worker identity secret
- short-lived per-job credentials minted for the specific lease they hold
- environment-approved provider credentials for the provider families the platform explicitly supports
- short-lived signed upload or download intents issued for known artifact rows

They may not hold:

- contributor browser cookies
- Cloudflare Access assertions copied from human sessions
- trusted-local `CODEX_HOME/auth.json` or any equivalent host-user auth cache
- ad hoc long-lived credentials that are not tied to the approved environment and pool model

This keeps hosted execution distinct from trusted-local execution both technically and operationally.

## Supported-scope boundary

The platform baseline accepts one deliberately narrow hosted scope:

- Modal-hosted workers execute repository-owned benchmark packages and prompt packages
- hosted execution remains downstream of the control plane's run and attempt records
- provider access is limited to explicitly supported hosted provider families and auth modes
- artifact handling follows the existing control-plane-first lifecycle and release boundary

The platform baseline explicitly rejects:

- browser-direct calls into Modal workers
- interactive human sign-in inside hosted workers
- SSH-style operator access as a normal production control path
- provider-family support by implication rather than an explicit capability matrix
- "temporary" secret handling that bypasses the accepted worker identity and rotation model

## Control model

### Worker pools

Hosted workers operate in named pools owned by the control plane.

A pool is the scheduling and governance unit that groups:

- one runtime class or deployment posture
- one environment
- one capability set
- one budget and capacity envelope
- one rollout and incident domain

Runs and jobs target pools through control-plane policy, not by asking the browser to choose raw runtime objects.

### Worker instances

Each running hosted worker has:

- a durable worker identity
- a pool assignment
- a worker version and image identity
- a runtime environment label
- current health and lease state

Instance records must survive long enough for operators to reconstruct who claimed what, under which image and secret posture, during an incident or release review.

### Queue and lease authority

Queue partitioning, capacity targets, drain policy, and lease recovery remain API decisions.

Modal scaling may increase or decrease runtime slots, but it does not decide:

- which runs are eligible for claim
- whether a lease is still valid
- when a stuck lease may be abandoned
- whether an instance is drained, cordoned, or quarantined

The control plane must fail closed if runtime capacity and queue intent drift apart.

## Evidence and artifact boundary

Hosted execution is only useful if it stays reproducible and reviewable.

The hosted platform therefore inherits the existing artifact and evidence rules:

- canonical attempt evidence is registered against durable artifact rows first
- uploads use short-lived signed intents for exact artifact identities
- missing, quarantined, and deleted evidence remain visible in private read models
- release-safe public reporting is derived from approved control-plane objects, not raw hosted runtime files

Modal local disks, ephemeral logs, and runtime scratch space are not durable evidence stores. Anything needed for reproducibility, incident handling, or release proof must end up in control-plane metadata or managed artifact storage.

## Operator model

Hosted execution is not complete until operators can safely run it.

The platform baseline requires operators to have durable visibility into:

- pool inventory and capacity posture
- worker registration, heartbeat freshness, drain state, and stuck-lease state
- rollout version, image digest, and environment status
- provider and artifact incident posture
- release, rollback, and token-rotation evidence
- spend and quota posture significant enough to block new launches or scale-up

This visibility belongs in portal-admin or operator surfaces backed by the API, not in ad hoc Modal dashboard knowledge.

## Promotion and rollback posture

Hosted worker promotion must be evidence-gated.

The baseline requires:

- digest-pinned worker images
- environment-specific rollout targets
- explicit staging verification before production promotion
- rollback readiness that references the prior known-good image and secret posture
- release evidence that ties the promoted image, control-plane expectations, and observed smoke results together

Green CI alone is not enough. Promotion must cite the named worker, auth, and runtime smoke evidence described in `docs/runtime.md` plus the later hosted-worker-specific staging and chaos evidence.

## Security and failure posture

The hosted platform must fail closed on the boundaries most likely to be abused or misunderstood:

- unsupported provider family or auth mode
- worker identity mismatch
- expired or revoked job credential
- network egress outside the approved hosted policy
- artifact checksum or metadata mismatch
- stale heartbeat or ambiguous lease ownership
- runtime drift between expected and deployed image or environment config

A hosted worker that cannot prove it is still safe and correctly scoped must stop claiming work rather than degrade into best-effort execution.

## Budget and governance posture

Hosted execution is a governed product capability, not unbounded background compute.

The accepted governance boundary includes:

- pool-level capacity policy
- environment-level rollout approval
- provider usage and budget caps
- evidence retention and incident-hold posture
- operator authority for drain, quarantine, rollback, and token rotation

Collaborator launch flows may request work, but they do not directly override hosted fleet policy.

## Relationship to child scopes

This parent baseline fixes the system shape and ownership split. The detailed follow-on scopes decompose the harder platform decisions:

- `#917` defines the concrete Modal workspace, app, environment, network, and deployment topology
- `#918` defines worker identity, bootstrap tokens, per-job tokens, revocation, and rotation
- `#919` defines the supported hosted provider families and credential ownership model
- `#920` defines image promotion, digest pinning, rollout gates, rollback, and release evidence
- `#921` defines pool registry shape, queue partitioning, capacity targets, and autoscaling signals
- `#922` defines worker lifecycle, registration, heartbeat, drain, and lease recovery
- `#923` defines workspace isolation, filesystem policy, artifact staging, and quarantine boundaries
- `#924` defines observability, audit trail, alerting, and incident signals
- `#925` defines operator runbooks for the normal and incident cases
- `#926` defines the portal information architecture for worker operations
- `#927` defines staging smoke, chaos testing, and disaster-recovery verification
- `#928` defines spend, quota, and budget governance
- `#929` defines network egress policy and secret exfiltration boundaries

Those child scopes should not redefine the parent ownership split. They elaborate it.

## MVP-adjacent implementation consequences

The next execution wave should assume:

- hosted worker fleet work must be API-first and environment-aware
- fixture-only portal worker data is temporary and must be replaced by real control-plane read models
- provider credential handling, artifact upload, and token issuance are core platform work, not follow-up polish
- staging verification, rollback evidence, and operator controls are part of the product slice, not optional launch-day cleanup

This is why the hosted-worker execution epic stays split across backend, AI worker, infrastructure, project-ops, and frontend lanes.

## Explicit out-of-scope decisions

This scope does not:

- provision Modal resources
- implement token storage, rotation jobs, or pool registries
- define the exact provider capability matrix
- define the detailed portal worker IA
- replace existing artifact, release, or benchmark baselines

It defines the platform contract those implementation slices must honor.

## Follow-up execution relationship

Execution issues `#906` through `#943` are the implementation set under this platform baseline.

They should be treated as one coordinated hosted-worker program with separate ownership lanes, not as unrelated convenience tickets.
