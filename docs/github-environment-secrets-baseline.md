# GitHub Environment Secrets Baseline

This baseline defines how deployment credentials are scoped in GitHub so production and staging automation can use the same workflow code without storing long-lived credentials in repository files. The source of truth for secret values stays outside git. GitHub environments hold only the encrypted deployment values that the relevant workflow job needs at runtime.

The repository should keep two deployment environments in GitHub: `staging` and `production`. `production` is used by deploy jobs on `main`. `staging` is reserved for manual promotion and pre-production validation workflows.

Each environment should currently carry the same required secret names, with environment-specific values:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `RAILWAY_API_TOKEN`
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`

Using the same names in both environments keeps workflow configuration stable while still allowing strict value separation. A workflow job resolves `${{ secrets.NAME }}` from the job environment scope first, so production jobs do not accidentally read staging credentials and vice versa.

The repository now includes `infra/scripts/configure-github-environment-secrets.mjs` to bootstrap and update these environment secrets through the GitHub API. The script reads values from local shell variables, supports a dry-run mode by default, and only mutates GitHub state when run with `--apply`.

Expected input variable patterns for the script are:
- environment-specific: `<ENVIRONMENT>_<SECRET_NAME>` (for example `PRODUCTION_CLOUDFLARE_API_TOKEN`)
- fallback/shared: `<SECRET_NAME>` (used when an environment-specific override is not provided)

Example dry run:

```bash
node infra/scripts/configure-github-environment-secrets.mjs --repo Tomodovodoo/ParetoProof
```

Example apply run:

```bash
node infra/scripts/configure-github-environment-secrets.mjs --repo Tomodovodoo/ParetoProof --apply
```

For routine repository usage, prefer `bun run bootstrap:github:env-secrets -- --repo <owner/repo>` so the bootstrap command is discoverable from `package.json`.

Operational rules:
- never commit live deployment secret values
- keep deployment jobs pinned to an explicit GitHub environment
- rotate staging and production secrets independently
- if an environment secret is compromised, replace only that environment value and record the rotation in operational notes
