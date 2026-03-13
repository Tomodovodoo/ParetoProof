# Worker

`apps/worker` holds the control code that remote worker runtimes will execute. The exact image contents and Lean toolchain policy remain a separate scope, but the worker service boundary is now fixed.

## Ingress policy

Workers are outbound-only for MVP. Do not add inbound HTTP server listeners in `apps/worker/src`.

- Run `bun run check:worker:no-public-ingress` after worker changes.
- PR CI enforces the same policy check.
