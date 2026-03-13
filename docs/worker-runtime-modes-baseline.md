# Worker Runtime Modes Baseline

This document defines the authoritative worker runtime modes and CLI surfaces for the ParetoProof MVP. It fixes how the worker package should span local artifact materialization, local single-run execution, offline ingest, and hosted claim-loop execution without inventing different attempt semantics for each environment.

The goal is to lock the command-surface map before more execution work lands in `apps/worker`.

## Scope of the baseline

This baseline owns:

- the canonical worker runtime mode catalog
- the approved top-level CLI command families for `apps/worker`
- the input and output boundary for each mode
- the auth and runtime expectations for local versus hosted worker operation
- the mapping from local single-run execution onto the later hosted claim loop

This baseline does not own:

- implementation of the worker runtime itself
- queue scheduling or lease policy details
- changes to the benchmark package, prompt package, or run-bundle file contracts
- numeric execution budgets or verifier policy details

## Core principles

The MVP worker model follows six hard rules:

- one worker package may expose multiple commands, but all execution modes must converge on the same canonical attempt and run-bundle contracts
- artifact materialization, attempt execution, offline ingest, and hosted claim-loop execution are different runtime modes, not different benchmark semantics
- hosted execution must reuse the same inner attempt runner that local single-run execution uses; the claim loop is an outer orchestration wrapper
- offline ingest imports a completed run bundle and must not pretend to be a live worker lease
- auth mode and runtime mode are related but distinct; trusted-local user auth is allowed only for local execution on a contributor-controlled machine
- the worker CLI should stay flat and explicit, with verb-object commands rather than hidden mode switches that blur artifact preparation, execution, and ingest

## Canonical runtime mode catalog

The MVP worker surface has four runtime modes.

### 1. `artifact_materialization`

`artifact_materialization` creates deterministic offline inputs or terminal bundle trees without contacting the hosted worker control plane.

This mode currently includes three supported commands:

- `materialize-problem9-package`
- `materialize-problem9-prompt-package`
- `materialize-problem9-run-bundle`

Its role is to make the offline Problem 9 contracts concrete for fixture generation, bundle verification, local debugging, and later ingest preparation.

#### Inputs

- repository-owned benchmark sources for `materialize-problem9-package`
- a canonical benchmark package plus run metadata for `materialize-problem9-prompt-package`
- prompt-package, candidate, compiler, verifier, and environment evidence for `materialize-problem9-run-bundle`

#### Outputs

- a canonical `problem9-package/` tree
- a canonical `problem9-prompt-package/` tree
- a canonical `problem9-run-bundle/` tree

#### Runtime and auth expectations

- allowed in local contributor shells, local Docker, CI, and other non-hosted build contexts
- no provider auth required
- no worker bootstrap token required
- no dependency on the internal claim-loop API surface

This mode is the current live CLI surface in `apps/worker/src/index.ts`.

### 2. `local_single_run`

`local_single_run` executes one concrete Problem 9 attempt locally and emits the same canonical run-bundle boundary that hosted execution will later submit or ingest.

This mode is approved now but not implemented yet. The reserved top-level command is:

- `run-problem9-attempt`

The command should own one attempt from prepared input through final validation and bundle output. It may call shared helpers that also support the materialization commands, but the user-facing result of the command must be one terminal attempt plus a canonical run bundle rather than a pile of ad hoc scratch files.

#### Inputs

- `problem9-package/` root
- `problem9-prompt-package/` root
- run-mode metadata already aligned to [problem9-agent-loop-baseline.md](problem9-agent-loop-baseline.md)
- provider family, auth mode, and model configuration
- runtime-specific writable workspace and output directory

#### Outputs

- terminal attempt result and stop reason
- authoritative compile and verifier evidence
- canonical `problem9-run-bundle/` output suitable for later ingest
- optional local logs or transcripts that remain subordinate to the bundle contract

#### Runtime and auth expectations

- supported on a trusted contributor machine in a local shell or local container runtime
- may use `trusted_local_user` auth only in this local mode and only under the constraints in [worker-secret-injection-baseline.md](worker-secret-injection-baseline.md)
- may also use machine auth such as `CODEX_API_KEY` for local non-interactive reruns
- must not require worker claim, lease, or heartbeat semantics

This is the canonical shared inner execution mode for MVP worker runtime implementation.

### 3. `offline_ingest`

`offline_ingest` submits a completed offline run bundle to the API ingest path after local execution has already finished.

This mode is approved now but not implemented yet. The reserved top-level command is:

- `ingest-problem9-run-bundle`

This command exists to bridge offline local execution into the control plane without pretending that the bundle came from a live claimed worker job.

#### Inputs

- completed `problem9-run-bundle/` root or equivalent packaged bundle input
- API base URL and ingest-target metadata
- explicit ingest credentials for the eventual offline ingest surface

#### Outputs

- ingest request acceptance or rejection
- ingest record identifier or equivalent server acknowledgement
- no new benchmark execution artifacts beyond optional upload packaging or local validation logs

#### Runtime and auth expectations

- operator-triggered local or automation-triggered environment
- not a hosted claim-loop mode
- must not use worker bootstrap tokens or job lease tokens as ingest credentials
- must use the future offline-ingest auth surface, which may be human-admin or dedicated operator machine auth, but not trusted-local ChatGPT session material

The important boundary is that ingest imports a finished result. It does not execute, heartbeat, or synthesize worker events after the fact.

### 4. `hosted_claim_loop`

`hosted_claim_loop` is the long-running service mode for hosted workers.

The top-level command is:

- `run-worker-claim-loop`

This command owns claim, heartbeat, cancellation observation, artifact coordination, and terminal submission against the internal worker API surface. It is the hosted outer driver, not a separate attempt semantics.

#### Inputs

- `API_BASE_URL`
- `WORKER_BOOTSTRAP_TOKEN`
- provider machine-auth credentials such as `CODEX_API_KEY`
- any runtime configuration required to locate the pinned execution image, writable workspace, and artifact-upload helpers

#### Outputs

- internal worker API claims, heartbeats, events, and terminal result submissions
- the same per-attempt compile, verifier, and bundle evidence that `local_single_run` produces
- no browser-facing or portal-authenticated side effects

#### Runtime and auth expectations

- hosted-only or other non-interactive service runtime
- machine auth only for provider access
- never allowed to use `trusted_local_user` auth or local `auth.json`
- must follow the service-authenticated boundary from [internal-contracts-api-baseline.md](internal-contracts-api-baseline.md) and [worker-control-contract-baseline.md](worker-control-contract-baseline.md)

## Approved CLI surface

The approved worker CLI surface is:

### Implemented now

- `materialize-problem9-package`
- `materialize-problem9-prompt-package`
- `materialize-problem9-run-bundle`
- `run-worker-claim-loop`

### Reserved for follow-up implementation

- `run-problem9-attempt`
- `ingest-problem9-run-bundle`

The flat command family is deliberate. The worker CLI should not collapse these into one overloaded command with hidden behavior changes, because the operator needs to know whether they are materializing artifacts, running a local attempt, importing a completed result, or starting a hosted worker daemon.

## Command-surface mapping to the hosted worker loop

The canonical mapping is:

- `artifact_materialization` prepares immutable inputs or terminal bundle trees
- `local_single_run` performs one attempt and writes a canonical run bundle
- `offline_ingest` submits that completed bundle into the control plane
- `hosted_claim_loop` claims assignments and repeatedly delegates each assignment's inner execution to the same logic used by `local_single_run`

In other words:

- `run-worker-claim-loop` is the outer hosted scheduler client
- `run-problem9-attempt` is the inner attempt executor
- the inner executor must stay environment-portable so local reruns and hosted claims do not diverge in semantics

This keeps future debugging sane. If a hosted claim fails, the same assignment should be reproducible through the local single-run surface without needing a different benchmark or artifact contract.

## Auth mode versus runtime mode

The worker runtime matrix is intentionally narrow.

### Allowed combinations

- `artifact_materialization`:
  - no provider auth
  - local shell, local container, CI, or other non-hosted build context
- `local_single_run`:
  - `trusted_local_user` on a trusted contributor machine
  - `machine_api_key` for local non-interactive reruns
- `offline_ingest`:
  - dedicated ingest-surface credentials only
  - local or operator-driven automation runtime
- `hosted_claim_loop`:
  - service auth for worker-control APIs
  - machine auth for provider access

### Forbidden combinations

- `trusted_local_user` auth in hosted Modal or other non-interactive runtimes
- worker bootstrap credentials used to impersonate offline ingest
- portal or browser auth used as worker claim-loop identity
- command surfaces that silently swap auth modes when the requested mode is unavailable

If the requested auth material is absent, the worker should fail explicitly instead of broadening permissions or mutating semantics.

## Expected code structure implications

This baseline implies a specific implementation split in `apps/worker`:

- CLI parsing in `src/index.ts`
- shared package and bundle materializers in library helpers
- one reusable attempt runner library behind `run-problem9-attempt`
- one hosted loop wrapper that calls the reusable attempt runner for each claimed assignment
- one ingest client wrapper that validates and submits completed bundles

The important implementation rule is that hosted execution must not fork a second private attempt pipeline with different validation or bundling behavior.

## Downstream issue framing

This baseline should be followed by concrete execution issues for:

- extending `apps/worker/src/index.ts` with the reserved runtime commands above
- implementing `run-problem9-attempt` against the canonical package, prompt-package, and run-bundle contracts
- implementing `run-worker-claim-loop` as a hosted wrapper around the shared attempt runner

An offline-ingest implementation issue should also be opened once the ingest API surface is scoped tightly enough to support `ingest-problem9-run-bundle`.

## Out of scope

- exact flag lists for the reserved commands
- scheduler retry policy or lease timing details
- model-provider-specific prompting optimizations
- implementation of upload transport or artifact storage adapters
