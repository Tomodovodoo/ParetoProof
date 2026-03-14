# Web App

`apps/web` is the React and Vite frontend for the public site, auth entry, and authenticated portal UI.

Cloudflare Pages is configured around this app through the local Wrangler config. The project name is `paretoproof-web`, the build output is `dist`, and deployments should build the workspace from the repository root before uploading the finished bundle to Pages.

Runtime env guidance:

- use [docs/runtime.md](../../docs/runtime.md) as the runtime baseline for browser env versus hosted auth-entry secrets
- the Pages auth-entry runtime owns the provider-start handlers and a legacy finalize compatibility route, while branded completion now posts into the API audience handoff at `/portal/session/finalize/submit`
- use [`.env.example`](./.env.example) only as the local browser-build example
