# Infrastructure

`infra` is for repository-owned operational material: Docker-related assets, helper scripts, and examples that support deployment and local development without belonging to a single app package.

Current helper scripts:
- `infra/scripts/configure-github-environment-secrets.mjs`: bootstraps and updates staging/production GitHub environment secrets from local shell variables.
- `infra/scripts/check-bidi-chars.mjs`: fails CI when tracked files contain hidden or bidirectional Unicode control characters that could hide malicious diffs or review artifacts.
- `infra/scripts/check-runtime-env-examples.mjs`: fails CI when app `.env.example` files or README env pointers drift from the approved runtime-env contract shape.
