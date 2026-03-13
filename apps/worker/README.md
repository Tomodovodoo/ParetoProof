# Worker

`apps/worker` holds the control code that remote worker runtimes will execute. The exact image contents and Lean toolchain policy remain a separate scope, but the worker service boundary is now fixed.

Current runtime-secret contract:

- local runs may set worker runtime variables in `apps/worker/.env`
- hosted Modal workers receive the same variable names through Modal Secret injection
- the current hosted baseline is documented in `docs/modal-worker-secrets-baseline.md`
- the broader local-versus-Modal injection model is documented in `docs/worker-secret-injection-baseline.md`
- use `bun run bootstrap:modal:worker-secrets -- --worker-environment dev --apply` to sync the base worker bootstrap token into Modal from a local runtime-only source
- worker commands now validate runtime env by command family before execution starts:
  - materializers stay env-free
  - `run-problem9-attempt` validates by effective auth mode
  - `run-problem9-attempt-in-devbox` requires a readable trusted-local `CODEX_HOME/auth.json`
  - future hosted claim-loop and offline-ingest modes reserve `API_BASE_URL` and `WORKER_BOOTSTRAP_TOKEN` as their canonical runtime requirements

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

Trusted-local devbox wrapper:

- use `bun run run:problem9-attempt:trusted-local -- --image <docker-image> --preflight-only` to run the trusted-local host-side plus in-container auth preflight without starting an attempt
- use `bun run run:problem9-attempt:trusted-local -- --image <docker-image> --benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> --provider-model <model> [--model-snapshot-id <id>] [--print-docker-command]` to launch the worker attempt through a local Docker/devbox wrapper
- the wrapper resolves host `CODEX_HOME`, verifies the host `auth.json`, runs host `codex login status`, mounts only that file read-only at `/run/paretoproof/codex-home/auth.json`, sets in-container `CODEX_HOME=/run/paretoproof/codex-home`, runs in-container `codex login status`, and only then starts `run-problem9-attempt`
- the wrapper does not mount the full host Codex home and does not silently fall back from `trusted_local_user` to `machine_api_key`
- benchmark-package and prompt-package inputs are mounted read-only; workspace and output parents are mounted writable so the inner runner can safely clear and recreate the selected subdirectories
- the supplied Docker image must already include the Codex CLI and the worker runtime; if it cannot run `codex login status`, trusted-local preflight fails before any attempt starts
