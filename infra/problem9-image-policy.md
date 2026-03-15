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
- Use `node infra/scripts/check-problem9-image-policy.mjs` or `bun run check:problem9-image-policy` to confirm workflows, package scripts, and the worker/infra docs still match the manifest.
- For rollback, identify the required digest from the workflow artifact, re-publish or deploy by digest, and record the chosen digest in the release evidence instead of relying on `main`.
