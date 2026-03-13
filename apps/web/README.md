# Web App

`apps/web` is the React and Vite frontend. It will contain the public site and the authenticated portal UI, while authentication and execution authority remain outside the browser.

Cloudflare Pages is configured around this app through the local Wrangler config. The project name is `paretoproof-web`, the build output is `dist`, and deployments should build the workspace from the repository root before uploading the finished bundle to Pages.

Runtime env guidance:

- use [docs/runtime-env-contract-baseline.md](../../docs/runtime-env-contract-baseline.md) as the authoritative source for browser build-time overrides versus Pages auth-entry runtime secrets
- the Pages auth-entry runtime owns both the provider-start handlers and the finalize relay that forwards Access assertion plus auth cookies to the API server-side
- use [`.env.example`](./.env.example) only as the local browser-build example
