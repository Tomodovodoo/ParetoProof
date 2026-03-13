# Worker

`apps/worker` holds the control code that remote worker runtimes will execute. The exact image contents and Lean toolchain policy remain a separate scope, but the worker service boundary is now fixed.

Current runtime-secret contract:

- local runs may set worker runtime variables in `apps/worker/.env`
- hosted Modal workers receive the same variable names through Modal Secret injection
- the current hosted baseline is documented in `docs/modal-worker-secrets-baseline.md`
- the broader local-versus-Modal injection model is documented in `docs/worker-secret-injection-baseline.md`
- use `bun run bootstrap:modal:worker-secrets -- --worker-environment dev --apply` to sync the base worker bootstrap token into Modal from a local runtime-only source

Package materialization:

- use `bun --cwd apps/worker materialize:problem9-package -- --output <directory>` to
  write the canonical `firstproof/Problem9` package into a clean output root
- the checked-in source manifest at `benchmarks/firstproof/problem9/benchmark-package.json`
  is authoring metadata; the materialized package gets a generated
  digest-filled `benchmark-package.json`
- the benchmark package root consumed by later commands is the emitted
  `<directory>/firstproof/Problem9`
- use `bun --cwd apps/worker materialize:problem9-prompt-package -- --output <directory> --benchmark-package-root <directory> --run-id <id> --attempt-id <id> --lane-id <id> --run-mode <mode> --tool-profile <profile> --provider-family <family> --auth-mode <mode> --model-config-id <id> --harness-revision <revision>` to emit the canonical prompt package for one Problem 9 attempt
- the prompt package writes `prompt-package.json` plus the reviewable raw prompt layers `system.md`, `benchmark.md`, `item.md`, and `run-envelope.json`
- use `bun --cwd apps/worker materialize:problem9-run-bundle -- --output <directory> --benchmark-package-root <directory> --prompt-package-root <directory> --candidate-source <file> --compiler-diagnostics <file> --compiler-output <file> --verifier-output <file> --environment-input <file> --result <pass|fail> --semantic-equality <pass|fail> --surface-equality <pass|fail> --surface-drift <true|false> --contains-sorry <true|false> --contains-admit <true|false> --axiom-check <pass|fail> --diagnostic-gate <pass|fail> --status <success|failure|incomplete> --stop-reason <reason> [--failure-code <code>]` to emit the canonical `problem9-run-bundle/` directory for one offline attempt
- the run-bundle materializer copies the benchmark and prompt manifests, writes `package-ref.json` and `verdict.json`, preserves the required verification/environment artifacts, and computes deterministic `artifactManifestDigest` and `bundleDigest` values for the bundle root
