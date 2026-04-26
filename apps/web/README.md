# Web App

`apps/web` is the React and Vite frontend for the public site, auth entry, and authenticated portal UI.

Cloudflare Pages is configured around this app through the local Wrangler config. The project name is `paretoproof-web`, the build output is `dist`, and deployments should build the workspace from the repository root before uploading the finished bundle to Pages. Repository-owned production uploads are sourced from `main`; branch builds are preview or local-only and must not be uploaded as the Pages `main` branch.

Runtime env guidance:

- use [docs/runtime.md](../../docs/runtime.md) as the runtime baseline for browser env versus hosted auth-entry secrets
- use [docs/runtime-env-mode-checklists.md](../../docs/runtime-env-mode-checklists.md) for the concrete local browser and Pages auth-entry runtime checklists
- the Pages auth-entry runtime owns the provider-start handlers and branded finalize relay; production completion stays on `/api/access/finalize`, while local loopback-branded previews target the local API finalize-submit route directly when the local API is running with localhost origin exceptions enabled
- use [`.env.example`](./.env.example) only as the local browser-build example
