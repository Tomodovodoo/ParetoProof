# Worker

`apps/worker` holds the control code that remote worker runtimes will execute. The exact image contents and Lean toolchain policy remain a separate scope, but the worker service boundary is now fixed.

Current runtime-secret contract:

- local runs may set worker runtime variables in `apps/worker/.env`
- hosted Modal workers receive the same variable names through Modal Secret injection
- the current hosted baseline is documented in `docs/modal-worker-secrets-baseline.md`
- the broader local-versus-Modal injection model is documented in `docs/worker-secret-injection-baseline.md`
- use `bun run bootstrap:modal:worker-secrets -- --worker-environment dev --apply` to sync the base worker bootstrap token into Modal from a local runtime-only source

Problem 9 package materialization:

- repository-owned authoring source lives in `benchmarks/firstproof/problem9/`
- the checked-in source tree does not include `benchmark-package.json`; that file is generated during materialization
- build the worker package, then materialize with:
  - `bun --cwd apps/worker build`
  - `bun --cwd apps/worker materialize:problem9-package -- --output <directory>`
- the command writes the canonical package under `<directory>/firstproof/Problem9/` and prints the deterministic manifest and package digests
