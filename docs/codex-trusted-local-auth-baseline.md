# Codex Trusted Local Auth Baseline

This document defines how trusted local Codex account auth is surfaced into local ParetoProof devbox and worker runs without storing ChatGPT-managed auth material in images, repositories, `.env` files, or hosted secret stores.

The goal is to fix one exact local mount contract so follow-up wrapper work does not improvise incompatible or unsafe auth handoff paths.

## Scope of the baseline

This baseline owns:

- the canonical host-side source of trusted local Codex auth
- the canonical in-container `CODEX_HOME` and `auth.json` mount contract
- read-only mount and non-persistence rules
- login-status preflight expectations
- failure behavior when trusted local auth is missing, unreadable, or invalid

This baseline does not own:

- machine-auth provider policy for hosted runners
- implementation of local wrapper scripts
- implementation of local run launchers in `apps/worker`
- hosted Modal execution, which must not use this auth path

## Core decision

Trusted local Codex auth is a host-mounted local-only capability.

The approved contract is:

- source auth from the contributor's host Codex home
- require a host `auth.json`
- mount that file read-only into a minimal in-container `CODEX_HOME`
- run trusted-local attempts only after explicit login-status preflight checks succeed
- fail fast if the auth mount is unavailable or invalid

This path is allowed only for trusted contributor-controlled local runs. It is never a hosted secret or image-layer input.

## Host-side source of truth

The canonical host-side source of trusted local Codex auth is:

- `${CODEX_HOME}/auth.json` when `CODEX_HOME` is explicitly set on the host
- otherwise the platform-default Codex home:
  - POSIX: `~/.codex/auth.json`
  - Windows: `%USERPROFILE%\\.codex\\auth.json`

The host path is resolved by the local wrapper before any container or devbox launch begins.

The wrapper must treat the host `auth.json` as the only required trusted-local credential artifact for this path. It must not require the whole host Codex home to be exposed by default.

## Canonical mount contract

The stable in-container contract is:

- set `CODEX_HOME=/run/paretoproof/codex-home`
- mount the host auth file at `/run/paretoproof/codex-home/auth.json`
- mount that file read-only
- ensure the parent directory exists in the container runtime before execution starts

This gives every local wrapper one stable runtime location regardless of the host operating system or the host's actual Codex home path.

The important boundary is:

- host path selection is wrapper-owned
- in-container path selection is baseline-owned

That prevents benchmark code, scripts, or docs from depending on a contributor-specific workstation path.

## Minimal exposed surface

The default trusted-local auth mount should expose only the minimum Codex state needed for login-backed local execution:

- `auth.json`

The wrapper should not mount the entire host `CODEX_HOME` by default. In particular, it must avoid mounting:

- host automation state
- skills
- transcript history
- local config files unless a later issue explicitly approves them
- any other incidental Codex-managed files

If future execution work proves that additional read-only Codex files are strictly required, that must be introduced as a follow-up scope update rather than as an implicit wrapper expansion.

## Read-only and non-persistence rules

Trusted local Codex auth must follow four hard rules:

- `auth.json` is always mounted read-only
- no wrapper may copy `auth.json` into the repository, image layers, Docker build context, Modal Secrets, CI artifacts, or committed fixture directories
- no wrapper may serialize trusted local Codex auth into `.env` files or normal environment variables
- no local run may mutate or refresh host auth state from inside the container as part of normal benchmark execution

The container may read mounted auth state. It must not become the authority that writes or rotates that state.

## Approved runtime locations

The trusted-local Codex path is approved only for:

- local `problem9-devbox` usage on a contributor-controlled machine
- local trusted worker wrappers that intentionally run with `authMode=trusted_local_user`

This path is not approved for:

- `problem9-execution` as the canonical non-interactive verdict image
- hosted Modal workers
- CI jobs
- remote shared shells
- any run mode that depends on machine-managed or service-managed auth instead of a local signed-in user

If a workflow is non-interactive by design, it must use machine auth instead of this path.

## Login-status preflight checks

Trusted-local runs must perform non-mutating preflight checks before the actual worker attempt starts.

### Host-side preflight

The wrapper must verify:

- the resolved host `auth.json` path exists
- the file is readable by the launching user
- `codex login status` succeeds against the resolved host auth home

The host-side check should happen before any container startup so missing login state fails early and locally.

### In-container preflight

The wrapper or run launcher must then verify inside the local runtime that:

- `CODEX_HOME` points at `/run/paretoproof/codex-home`
- `/run/paretoproof/codex-home/auth.json` exists and is readable
- `codex login status` succeeds against the mounted in-container home

This second check catches bad mount wiring, wrong permissions, or wrapper bugs that the host-side check alone would miss.

## Failure behavior

Trusted-local auth failures are preflight failures, not benchmark verdicts.

The local wrapper must fail fast and clearly when any of these conditions hold:

- host `auth.json` is missing
- host `auth.json` is unreadable
- in-container mount target is missing
- in-container mounted `auth.json` is unreadable
- `codex login status` fails on the host
- `codex login status` fails in the local runtime

Required behavior on failure:

- do not start the benchmark attempt
- do not silently fall back to `machine_api_key`
- do not rewrite the request as a hosted-compatible run
- return an explicit local setup error that tells the operator whether the problem is missing auth, unreadable auth, or invalid login state

The only allowed auth-mode switch is an explicit user or wrapper choice made before launch, not an automatic downgrade after the trusted-local path fails.

## Local prerequisites

Before a trusted-local run is allowed, the local environment must satisfy all of the following:

- the contributor machine is trusted and under the contributor's control
- the user has an active local Codex login
- the local runtime can provide read-only bind mounts
- the runtime image or devbox includes the Codex CLI needed for `codex login status` and the trusted-local provider path
- the run is intentionally configured with `providerFamily=openai` and `authMode=trusted_local_user`

If the selected local image or runtime does not include the Codex CLI, that runtime is not eligible for the trusted-local path.

## Wrapper expectations

Follow-up local wrapper work should implement the contract above in this order:

1. resolve host `CODEX_HOME`
2. verify host `auth.json`
3. run host `codex login status`
4. mount host `auth.json` read-only at `/run/paretoproof/codex-home/auth.json`
5. set in-container `CODEX_HOME=/run/paretoproof/codex-home`
6. run in-container `codex login status`
7. only then start the trusted-local worker or devbox command

Wrappers should prefer explicit flags or profiles such as "trusted local Codex" over trying to infer this path automatically from ambient host state.

## Relationship to adjacent baselines

- [worker-secret-injection-baseline.md](worker-secret-injection-baseline.md) defines the higher-level local-versus-hosted secret model and says trusted local Codex auth is host-mounted only.
- [worker-runtime-modes-baseline.md](worker-runtime-modes-baseline.md) allows `trusted_local_user` only for local single-run execution.
- [docker-image-baseline.md](docker-image-baseline.md) keeps trusted interactive tooling in the devbox and excludes it from the canonical execution image.
- [provider-framework-api-baseline.md](provider-framework-api-baseline.md) defines `trusted_local_user` as an auth mode distinct from `machine_api_key`.

This document is the exact mount and preflight contract underneath those broader rules.

## Out of scope

- provider token refresh behavior
- machine-auth setup for hosted runs
- wrapper UX wording
- exact local command-line flags for future trusted-local wrappers
