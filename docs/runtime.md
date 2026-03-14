# Runtime

This repo uses a small number of runtime rules.

## Environment

- `apps/api/.env.example`, `apps/web/.env.example`, and `apps/worker/.env.example` are the local examples.
- [runtime-env-mode-checklists.md](./runtime-env-mode-checklists.md) is the operator-facing per-mode checklist for the supported local, hosted, and owner-only runtime paths.
- Keep browser env separate from Pages function secrets and worker machine credentials.
- Do not store short-lived access assertions, human session data, or local auth caches in committed env files.
- Do not copy `.codex/auth.json` or other trusted-local auth artifacts into the repository, Docker build contexts, or checked-in worker fixtures.

## Deploy surfaces

- Cloudflare Pages hosts the public site and auth-entry runtime.
- Railway hosts the API.
- Workers run locally or in hosted runtimes against the API control plane.
- GHCR holds worker images.
- Cloudflare R2 holds larger artifacts when the flow requires object storage.

## Worker rules

- Local trusted runs may use host-mounted auth material where explicitly supported.
- Local trusted auth stays host-local and enters the devbox only as a read-only `auth.json` mount, never as a copied repo file or baked image layer.
- Hosted runs must use machine auth only.
- Offline ingest is a control-plane import path, not a worker-bootstrap-token flow.
