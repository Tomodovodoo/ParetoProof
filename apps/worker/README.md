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
