# Worker

`apps/worker` holds the control code that remote worker runtimes will execute. The exact image contents and Lean toolchain policy remain a separate scope, but the worker service boundary is now fixed.

Docker targets:

- `apps/worker/Dockerfile` now exposes the repository-owned Problem 9 target graph:
  - `problem9-os-base`
  - `problem9-toolchain-base`
  - `problem9-app-build`
  - `problem9-benchmark-base`
  - `problem9-execution`
  - `problem9-devbox`
  - `paretoproof-worker`
- `problem9-execution` is the canonical non-interactive verdict environment and includes the built worker runtime, prompt templates, and checked-in `benchmarks/firstproof/problem9` source tree at the repo-root paths the CLI materializers resolve at runtime
- `problem9-devbox` extends `problem9-execution` with Bun `1.3.10`, Python `3.11`, Codex CLI, and `lean-lsp-mcp` for trusted-local contributor workflows
- `paretoproof-worker` remains the narrower hosted wrapper target and is published on `main` alongside the canonical `problem9-execution` image
- root-level image build commands for the named runtime targets:
  - `bun run build:problem9-execution` builds `problem9-execution` and tags it as `paretoproof-problem9-execution:local`
  - `bun run build:problem9-devbox` builds `problem9-devbox` and tags it as `paretoproof-problem9-devbox:local`
  - `bun run build:paretoproof-worker` builds `paretoproof-worker` and tags it as `paretoproof-worker:local`
- use `node infra/scripts/build-problem9-image.mjs --target <target> --dry-run` to print the exact `docker buildx build` command without executing it

Runtime env guidance:

- use [docs/runtime-env-contract-baseline.md](../../docs/runtime-env-contract-baseline.md) as the authoritative source for required versus optional worker variables by mode
- use [`.env.example`](./.env.example) only as the local developer-facing example
- hosted Modal secret inventory still lives in [docs/modal-worker-secrets-baseline.md](../../docs/modal-worker-secrets-baseline.md)
- local-versus-Modal injection rules still live in [docs/worker-secret-injection-baseline.md](../../docs/worker-secret-injection-baseline.md)
- use `bun run bootstrap:modal:worker-secrets -- --worker-environment dev --apply` to sync the base worker bootstrap token into Modal from a local runtime-only source

Package materialization:

- use `bun --cwd apps/worker materialize:problem9-package -- --output <directory>` to
  write the canonical `firstproof/Problem9` package into a clean output root
- the checked-in source manifest at `benchmarks/firstproof/problem9/benchmark-package.json`
  is authoring metadata; the materialized package gets a generated
  digest-filled `benchmark-package.json`
- use `bun --cwd apps/worker materialize:problem9-prompt-package -- --output <directory> --benchmark-package-root <directory> --run-id <id> --attempt-id <id> --lane-id <id> --run-mode <mode> --tool-profile <profile> --provider-family <family> --auth-mode <mode> --model-config-id <id> --harness-revision <revision>` to emit the canonical prompt package for one Problem 9 attempt
- the prompt package writes `prompt-package.json` plus the reviewable raw prompt layers `system.md`, `benchmark.md`, `item.md`, and `run-envelope.json`
- supported prompt and local-run auth modes now follow the MVP provider contract:
  - `trusted_local_user`
  - `machine_api_key`
  - `machine_oauth`
  - `local_stub`
- use `bun --cwd apps/worker materialize:problem9-run-bundle -- --output <directory> --benchmark-package-root <directory> --prompt-package-root <directory> --candidate-source <file> --compiler-diagnostics <file> --compiler-output <file> --verifier-output <file> --environment-input <file> --result <pass|fail> --semantic-equality <matched|mismatched|not_evaluated> --surface-equality <matched|drifted|not_evaluated> --contains-sorry <true|false> --contains-admit <true|false> --axiom-check <passed|failed|not_evaluated> --diagnostic-gate <passed|failed> --stop-reason <reason> [--failure-classification <file>]` to emit `problem9-run-bundle/` with the canonical manifests, copied package and prompt references, candidate source, verification artifacts, environment snapshot, and deterministic digests
- the run-bundle command is a supported standalone materializer for fixture generation and later offline-ingest prep; it derives run identity from the prompt package `run-envelope.json`, writes `package/package-ref.json`, `verification/verdict.json`, `artifact-manifest.json`, and `run-bundle.json`, and rejects output roots that overlap the benchmark package, prompt package, or any bundle input file
- use `bun --cwd apps/worker test:run-bundle` to run the fixture-backed standalone verification path, which materializes canonical benchmark and prompt inputs, runs the bundle CLI twice on identical fixture evidence, and checks that the resulting digests and root manifests are identical

Local attempt execution:

- use `bun --cwd apps/worker run:problem9-attempt -- --benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> [--provider-family <family>] [--auth-mode <mode>] [--provider-model <model>] [--model-snapshot-id <id>] [--stub-scenario exact_canonical|compile_failure]` to execute one local Problem 9 attempt and emit the canonical `problem9-run-bundle/`
- the command copies the immutable benchmark package into a clean writable workspace, writes the candidate as `FirstProof/Problem9/Candidate.lean`, runs the authoritative Lean compile gate, runs theorem and axiom verification, and finalizes through the existing run-bundle materializer instead of inventing a second output shape
- `trusted_local_user` runs fail fast if the resolved `CODEX_HOME/auth.json` is missing or unreadable or if `codex login status` fails; the command does not silently downgrade to machine auth
- `machine_api_key` runs require `CODEX_API_KEY`
- `local_stub` is the deterministic offline verification path for local dry runs and fixture generation

Offline ingest:

- use `bun run ingest:problem9-run-bundle -- --bundle-root <directory>` to validate and import one completed `problem9-run-bundle/` through the admin offline-ingest API route
- the ingest command validates the local bundle root before any network call by checking the required files, artifact-manifest entries, and canonical bundle digest fields
- offline ingest targets `POST /portal/admin/offline-ingest/problem9-run-bundles` and sends an explicit `Cf-Access-Jwt-Assertion` header; it never falls back to `WORKER_BOOTSTRAP_TOKEN`, provider auth, or trusted-local `auth.json`
- provide the Access assertion with `--access-jwt <token>` or `CF_ACCESS_JWT_ASSERTION`; provide the API origin with `--api-base-url <url>` or `API_BASE_URL`
- success and rejection outputs are emitted as machine-readable JSON for operator use

Trusted-local devbox wrapper:

- use `node infra/scripts/run-problem9-trusted-local-attempt.mjs --preflight-only` to run the repo-owned trusted-local host-side plus in-container auth preflight without starting an attempt
- use `bun run run:problem9-attempt:trusted-local -- --preflight-only` for the same repo-owned launcher through the root script alias
- use `node infra/scripts/run-problem9-trusted-local-attempt.mjs --benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> --provider-model <model> [--model-snapshot-id <id>] [--print-docker-command]` to launch the worker attempt through the canonical local Docker/devbox wrapper
- the repo-owned launcher defaults to `--image paretoproof-problem9-devbox:local`; pass `--image <docker-image>` only when you intentionally need a different local devbox tag
- the wrapper resolves host `CODEX_HOME`, verifies the host `auth.json`, runs host `codex login status`, mounts only that file read-only at `/run/paretoproof/codex-home/auth.json`, sets in-container `CODEX_HOME=/run/paretoproof/codex-home`, runs in-container `codex login status`, and only then starts `run-problem9-attempt`
- the wrapper does not mount the full host Codex home and does not silently fall back from `trusted_local_user` to `machine_api_key`
- benchmark-package and prompt-package inputs are mounted read-only; workspace and output parents are mounted writable so the inner runner can safely clear and recreate the selected subdirectories
- the supplied Docker image must already include the Codex CLI and the worker runtime; if it cannot run `codex login status`, trusted-local preflight fails before any attempt starts

Hosted claim loop:

- use `bun run run:worker-claim-loop -- --worker-id <id> --worker-pool <pool> --worker-version <version> --workspace-root <directory> --output-root <directory>` to claim hosted worker jobs from the internal worker API and run them through the existing Problem 9 attempt runner
- hosted claim-loop runtime env still comes from `API_BASE_URL`, `WORKER_BOOTSTRAP_TOKEN`, and the selected machine-auth provider credentials such as `CODEX_API_KEY`
- the loop claims one job at a time, materializes the benchmark and prompt package locally from the claimed identity, heartbeats while the attempt is running, appends explicit lifecycle events, submits the artifact manifest, and then submits either terminal success or terminal failure
- if a heartbeat returns `cancel_requested` or `expired`, the loop stops terminal submission for that job instead of racing a stale result write against a revoked lease

Hosted claim loop:

- use `bun run run:worker-claim-loop -- --auth-mode machine_api_key --once` to run one hosted claim attempt against the internal worker API
- required flags for hosted mode:
  - `--worker-id <id>`
  - `--worker-pool <pool>`
  - `--worker-version <version>`
  - `--workspace-root <directory>`
  - `--output-root <directory>`
- required env for hosted mode:
  - `API_BASE_URL`
  - `WORKER_BOOTSTRAP_TOKEN`
  - `CODEX_API_KEY` when `--auth-mode machine_api_key`
- the hosted loop only accepts `single_run` claims with machine auth, materializes the canonical benchmark and prompt packages from repo-owned sources, reuses the same `runProblem9Attempt` inner runner as local single-run execution, and submits heartbeats, execution events, artifact manifests, and terminal success or failure objects through the internal API
- use `--max-jobs <n>` to bound a longer poller run, `--provider-model <model>` to override the provider model derived from `modelConfigId`, and `--worker-runtime` to choose the runtime label sent in claim requests
- if the API reports `cancel_requested` or `expired` on a heartbeat before terminal submission, the loop exits that claim explicitly without sending a stale terminal finalize
