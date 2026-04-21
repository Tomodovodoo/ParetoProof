# Problem 9 Image Policy

The authoritative source of truth for the Problem 9 image graph is [`infra/docker/problem9-image-policy.json`](./docker/problem9-image-policy.json). Use this document for operator-facing guidance and use the manifest plus `node infra/scripts/check-problem9-image-policy.mjs` for drift checks.

## Tag policy

- Published images live under `ghcr.io/<repository-owner>/...`.
- `main` is the only mutable publish tag. It may move only when the owning publish workflow completes successfully on the default branch or from an explicit manual publish for the devbox image.
- `sha-<git sha>` tags are immutable provenance tags for the exact published commit.
- Rollback and provenance review must use the digest recorded in the publish workflow summary artifact rather than assuming the mutable tag still points at the intended build.

## Ownership matrix

### `problem9-execution`

- Docker target: `problem9-execution`
- Local build script: `bun run build:problem9-execution`
- Local tag: `paretoproof-problem9-execution:local`
- Published image: `ghcr.io/<repository-owner>/paretoproof-problem9-execution`
- Owning workflow: `.github/workflows/publish-worker-image.yml`
- Publish trigger: push to `main` for worker/build-graph changes or `workflow_dispatch`
- Digest evidence: `problem9-image-digests.md` workflow artifact and step summary entry
- Purpose: canonical non-interactive Problem 9 verdict environment

### `problem9-devbox`

- Docker target: `problem9-devbox`
- Local build script: `bun run build:problem9-devbox`
- Local tag: `paretoproof-problem9-devbox:local`
- Published image: `ghcr.io/<repository-owner>/paretoproof-problem9-devbox`
- Owning workflow: `.github/workflows/publish-problem9-devbox-image.yml`
- Publish trigger: `workflow_dispatch`
- Digest evidence: `problem9-devbox-image-digest.md` workflow artifact and step summary entry
- Purpose: trusted-local contributor/devbox image with Codex CLI and Lean support tools

### `paretoproof-worker`

- Docker target: `paretoproof-worker`
- Local build script: `bun run build:paretoproof-worker`
- Local tag: `paretoproof-worker:local`
- Published image: `ghcr.io/<repository-owner>/paretoproof-worker`
- Owning workflow: `.github/workflows/publish-worker-image.yml`
- Publish trigger: push to `main` for worker/build-graph changes or `workflow_dispatch`
- Digest evidence: `problem9-image-digests.md` workflow artifact and step summary entry
- Purpose: hosted worker wrapper image built from the same Dockerfile graph as `problem9-execution`

## Review and rollback

- Before changing image names, tags, or workflow ownership, update the JSON manifest first and then update any coupled workflows or docs in the same change.
- Use `node infra/scripts/check-problem9-image-policy.mjs` or `bun run check:problem9-image-policy` to confirm the manifest, publish workflow structure, verification steps, artifact uploads, package scripts, and the worker/infra docs still match.
- Use `bun run verify:problem9-execution-image` after `bun run build:problem9-execution` and `bun run verify:problem9-devbox-image` after `bun run build:problem9-devbox` when local image loading is available.
- If a local image-store issue blocks `--load`, export the target filesystem instead with `docker buildx build --file apps/worker/Dockerfile --target <target> --output type=local,dest=<directory> .` and pass `--rootfs <directory>` to `infra/scripts/verify-problem9-image-toolchains.mjs`.
- The verifier also checks the worker/shared workspace-local runtime dependency paths because Bun may keep packages such as `@paretoproof/shared` and `zod` under those workspace trees instead of hoisting them into repo-root `node_modules`.
- Pull-request CI is the authoritative pre-merge image smoke gate: it builds `paretoproof-problem9-execution:pr-smoke` and `paretoproof-problem9-devbox:pr-smoke` without publishing, then runs `infra/scripts/verify-problem9-image-toolchains.mjs` against those loaded images so the `lean`, `codex`, `lean-lsp-mcp`, and runtime-dependency surfaces fail before merge.
- The worker-image publish workflow verifies an exported `problem9-execution` rootfs before it pushes mutable or immutable tags.
- The devbox publish workflow verifies a loaded `paretoproof-problem9-devbox:verify` image before publish instead of exporting a local rootfs, because the rootfs export path can stall on GitHub Actions for the larger devbox target.
- For rollback, identify the required digest from the workflow artifact, re-publish or deploy by digest, and record the chosen digest in the release evidence instead of relying on `main`.
