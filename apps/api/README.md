# API

`apps/api` is the Fastify control plane. It owns auth mapping, run orchestration, ingest, database access, and the API boundary between the browser and worker execution.

Runtime env guidance:

- use [docs/runtime.md](../../docs/runtime.md) as the runtime baseline
- use [`.env.example`](./.env.example) only as the local developer-facing example for routine startup and owner ops

## Offline Problem 9 ingest

The admin surface now exposes `POST /portal/admin/offline-ingest/problem9-run-bundles`.

- Access: admin-only via the normal Access-backed `admin_only` guard.
- Input: an inline `Problem9OfflineIngestRequest` bundle payload containing the canonical Problem 9 benchmark package manifest, prompt package manifest, run bundle manifest, verifier verdict, environment snapshot, and required artifact-manifest entries.
- Validation: the API recomputes the canonical package, prompt, run-config, bundle, candidate, verdict, and environment digests before it writes anything. Missing required artifacts, inconsistent identities, or digest mismatches fail with `422`.
- Persistence: successful ingests create one terminal `run`, one terminal `job`, one terminal `attempt`, and metadata-only `artifacts` rows. Artifact rows register deterministic R2 object keys under `runs/<runId>/...` without uploading bytes yet.
- Duplicates: repeated ingests for the same `sourceRunId` fail with `409 offline_ingest_duplicate_run`.
- Buckets: metadata points at `paretoproof-production-artifacts` when `NODE_ENV=production`, otherwise `paretoproof-dev-artifacts`.
