# Web App

`apps/web` is the React and Vite frontend. It will contain the public site and the authenticated portal UI, while authentication and execution authority remain outside the browser.

Cloudflare Pages is configured around this app through the local Wrangler config. The project name is `paretoproof-web`, the build output is `dist`, and deployments should build the workspace from the repository root before uploading the finished bundle to Pages.
