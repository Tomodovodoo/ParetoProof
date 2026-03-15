# Infrastructure

`infra` is for repository-owned operational material: Docker-related assets, helper scripts, and examples that support deployment and local development without belonging to a single app package.

Current helper scripts:
- `infra/scripts/configure-github-environment-secrets.mjs`: bootstraps and updates staging/production GitHub environment secrets from local shell variables.
- `infra/scripts/check-bidi-chars.mjs`: fails CI when tracked files contain hidden or bidirectional Unicode control characters that could hide malicious diffs or review artifacts. It does not scan issue bodies, PR bodies, comments, or other GitHub discussion text, so GitHub can still warn on pasted content even when this repo check passes.
- `infra/scripts/check-runtime-env-examples.mjs`: fails CI when app `.env.example` files or README env pointers drift from the approved runtime-env contract shape.
- `infra/scripts/check-problem9-image-policy.mjs`: fails CI when the Problem 9 image manifest, publish workflows, root build scripts, or operator docs drift apart.
- `infra/scripts/verify-problem9-image-toolchains.mjs`: runs toolchain checks against a built `problem9-execution` or `problem9-devbox` image, or against a filesystem export of one, and fails on Lean, Node, Bun, Codex CLI, or `lean-lsp-mcp` drift.
- `infra/scripts/check-trusted-local-boundaries.mjs`: fails CI when repo ignore rules, worker Docker packaging, or trusted-local docs drift toward persisting Codex auth material in the repository or image build context.

Pull-request image smoke:
- `.github/workflows/pull-request-ci.yml` now builds `problem9-execution` and `problem9-devbox` without publishing, then runs `infra/scripts/verify-problem9-image-toolchains.mjs` against the loaded PR-smoke images so image-graph regressions fail before merge.

Problem 9 image policy:
- `infra/docker/problem9-image-policy.json`: authoritative manifest for the repository-owned Problem 9 image targets, local tags, published GHCR names, and owning workflows.
- `infra/problem9-image-policy.md`: operator-facing policy for mutable tags, immutable provenance tags, workflow ownership, and rollback by digest.

