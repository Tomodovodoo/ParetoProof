# Infrastructure

`infra` is for repository-owned operational material: Docker-related assets, helper scripts, and examples that support deployment and local development without belonging to a single app package.

Current helper scripts:
- `infra/scripts/configure-github-environment-secrets.mjs`: bootstraps and updates staging/production GitHub environment secrets from local shell variables.
- `infra/scripts/check-bidi-chars.mjs`: fails CI when tracked files contain hidden or bidirectional Unicode control characters that could hide malicious diffs or review artifacts. It does not scan issue bodies, PR bodies, comments, or other GitHub discussion text, so GitHub can still warn on pasted content even when this repo check passes.
- `infra/scripts/check-runtime-env-examples.mjs`: fails CI when app `.env.example` files or README env pointers drift from the approved runtime-env contract shape.
- `infra/scripts/check-trusted-local-boundaries.mjs`: fails CI when repo ignore rules, worker Docker packaging, or trusted-local docs drift toward persisting Codex auth material in the repository or image build context.
