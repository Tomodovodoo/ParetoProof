# Runtime

This repo uses a small number of runtime rules.

## Environment

- `apps/api/.env.example`, `apps/web/.env.example`, and `apps/worker/.env.example` are the local examples.
- [runtime-env-mode-checklists.md](./runtime-env-mode-checklists.md) is the operator-facing per-mode checklist for the supported local, hosted, and owner-only runtime paths.
- `bun run check:env-contract` is the checked-in contract guard for `.env.example` shape and the required runtime-doc cross-references.
- `bun run test:startup-validation` is the startup smoke suite behind the `Smoke startup validation across runtime surfaces` PR-CI step for the specific web, API, worker, and local-Docker checks it explicitly executes; it is not a full deployed-readiness proof for every hosted surface.
- API portal/auth/math origin and shared-cookie deployment assumptions are runtime-configurable; keep non-prod hostnames and cookie policy in the API runtime instead of re-hard-coding them in route helpers.
- Keep browser env separate from Pages function secrets and worker machine credentials.
- Do not store short-lived access assertions, human session data, or local auth caches in committed env files.
- Do not copy `.codex/auth.json` or other trusted-local auth artifacts into the repository, Docker build contexts, or checked-in worker fixtures.
- For math launches, provider-credential ownership and the no-browser-secret rule are defined in [math-provider-credential-policy-baseline.md](./math-provider-credential-policy-baseline.md).

## Deploy surfaces

- Cloudflare Pages hosts the public site and auth-entry runtime.
- Railway hosts the API.
- Workers run locally or in hosted runtimes against the API control plane.
- GHCR holds worker images.
- Cloudflare R2 holds larger artifacts when the flow requires object storage.
- Hosted Cloudflare Access split:
  - `api.paretoproof.com/portal/*` must bypass Cloudflare Access so `portal.paretoproof.com` and `math.paretoproof.com` can make cross-origin JSON `fetch()` calls without an opaque Access redirect.
  - `api.paretoproof.com/internal/*` stays behind its own Cloudflare Access app for owner and service-token callers.

## Worker rules

- Local trusted runs may use host-mounted auth material where explicitly supported.
- Local trusted auth stays host-local and enters the devbox only as a read-only `auth.json` mount, never as a copied repo file or baked image layer.
- The trusted-local devbox path uses the single-file mount contract `PARETOPROOF_TRUSTED_LOCAL_AUTH_MOUNT=readonly_auth_json` plus `CODEX_HOME=/run/paretoproof/codex-home`; malformed auth JSON or any other mount shape must fail closed.
- Hosted runs must use machine auth only.
- Hosted or packaged worker modes must reject the trusted-local mount contract instead of silently reusing mounted contributor auth material.
- Offline ingest is a control-plane import path, not a worker-bootstrap-token flow.

## Lifecycle Vocab

- Canonical run, job, and attempt lifecycle exports live in `@paretoproof/shared` `run-control` exports.
- Shared response contracts and the API Postgres enums must import those exports instead of re-declaring lifecycle strings locally.
- `apps/api/test/run-control-state-parity.test.ts` is the drift gate for catalogs, shared schemas, and API DB enum parity.

## Main-Branch Promotion Gate

Use the PR's `Pull Request CI / ci` run as the pre-merge PR smoke gate for worker, image, auth, and runtime slices.

Use `Pull Request Trusted Governance / governance` as the workflow-governance gate for the candidate PR-template contract, deployment-workflow policy, and main-branch promotion-policy wiring.

Changes to the trusted-governance workflow and validator implementation itself stay solely CODEOWNERS-owned by `@Tomodovodoo`.

The trusted workflow evaluates candidate policy files with trusted-base validator logic; it does not trust candidate validator implementation from the PR head.

Bootstrap rollout caveat: the PR that first introduces or replaces these protections still needs explicit owner review on the current base branch because new `CODEOWNERS` rules and `pull_request_target` gates only apply after merge.

PR-template completion is a separate merge-time governance record:

- `Linked issues`
- `Verification`
- `Security and cost review`
- `Rollout and rollback`

Those sections must contain real content rather than untouched template defaults, but they do not substitute for the named kernel-proof steps below.

Required kernel evidence comes from these named steps:

- image-build smoke:
  - `Build Problem 9 execution image smoke target`
  - `Verify Problem 9 execution image smoke target`
  - `Build Problem 9 devbox image smoke target`
  - `Verify Problem 9 devbox image smoke target`
- worker and verifier smoke:
  - `Run deterministic Problem 9 verifier smoke`
  - `Run deterministic Problem 9 local-stub attempt smoke`
- directly coupled auth or runtime gates:
  - `Check runtime env examples`
  - `Check trusted-local auth boundaries`
  - `Smoke startup validation across runtime surfaces`
  - `Test API auth handoff routes`
  - `Test web auth relay functions`

`Typecheck workspace`, `Build workspace`, and unrelated UI checks still matter, but they do not substitute for the named kernel-proof steps above when deciding whether a slice is ready to promote through `main`.

After merge, treat the main-branch publish workflows as release evidence only:

- `Publish Problem 9 Execution and Worker Images` records the pushed image digests in the `problem9-image-digests` artifact and step summary
- `Publish Problem 9 Devbox Image` records the pushed image digest in the `problem9-devbox-image-digest` artifact and step summary

Those post-merge artifacts are what a release packet should cite for published-image identity. They do not waive the requirement that the PR already proved the corresponding smoke evidence before merge.
