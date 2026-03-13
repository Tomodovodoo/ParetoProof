# Deployment Baseline

The repository is set up so each deployable surface can be built without prematurely locking the product into a narrow runtime story. The web app in `apps/web` is a normal Vite application and deploys to Cloudflare Pages. The API in `apps/api` is intended to run on Railway from the Bun workspace build output, while `apps/worker` keeps the container-oriented path that the later benchmark workers will need.

The Railway control-plane baseline now exists as a live service, not just a plan. The Railway project is `ParetoProof API`, the service is `api`, the service source points at `Tomodovodoo/ParetoProof`, and the instance is pinned to `apps/api` with `apps/api/railway.json` as its config boundary. The live service runtime now expects Railway-managed `DATABASE_URL`, `ACCESS_PROVIDER_STATE_SECRET`, `CF_ACCESS_TEAM_DOMAIN`, and either `CF_ACCESS_PORTAL_AUD` or `CF_ACCESS_AUD`, while `HOST` defaults to `0.0.0.0` and `PORT` remains Railway-provided. `CF_ACCESS_INTERNAL_AUD`, `CORS_ALLOWED_ORIGINS`, and `CORS_ALLOW_LOCALHOST` are optional runtime overrides rather than bootstrap-only notes. `api.paretoproof.com` is attached as the public API hostname, with Cloudflare routing it to Railway through the required `3md6bio9.up.railway.app` CNAME target.

Pages now has a concrete project baseline. The Cloudflare project is `paretoproof-web`, and its durable deployment path lives in `apps/web/wrangler.toml`. The public website is attached to `paretoproof.com` and `www.paretoproof.com`, the portal hostname is attached at `portal.paretoproof.com`, and `auth.paretoproof.com` is attached as the public login entrypoint that can forward users into the protected portal flow. Local frontend development is the pre-production path: contributors should run `bun run dev:web` from the repository root and validate unfinished website and portal work against the local Vite server instead of relying on a dedicated staging hostname or a protected preview URL.

Because the frontend consumes the shared workspace package, the web bundle should be built from the repository root with `bun run build:web:pages`, then uploaded to Pages from `apps/web/dist`. This keeps the Pages deployment path aligned with the Bun workspace instead of depending on a narrower dashboard root that would miss shared-package changes. The portal hostname is protected by a Cloudflare Access application with an owner-only bootstrap policy, and `apps/web/public/_headers` now carries the checked-in `X-Robots-Tag: noindex, nofollow, noarchive` policy for that host while leaving the public site indexable.

Each app also has a small `.env.example` file so deployment variables are easy to discover without pretending that the final secret model is already implemented. Those files are there to make local bootstrapping and platform configuration predictable, not to define the final production secret inventory. The authoritative staging-entry and manual-promotion flow for these surfaces lives in `staging-promotion-baseline.md`.

## Rollback Baseline

Rollback should stay service-local by default. Do not treat a bad web deploy, a bad API deploy, and a bad worker image as one giant rollback event unless the breakage clearly crosses those boundaries. The first question is always which deployable surface changed, and the second is which last-known-good revision for that same surface is still compatible with the current database and auth state.

### Web rollback (`paretoproof.com`, `www`, `auth`, `portal`)

The web rollback path belongs to the Cloudflare Pages project `paretoproof-web`. Roll back by restoring the last known good Pages deployment for the current hostnames rather than by changing DNS or Access boundaries. If the bad deploy came from a merged commit, use the previous known good Git revision as the rollback source, rebuild from the repository root with `bun run build:web:pages`, and deploy that output back through the normal Pages path in `apps/web`. If the incident is time-sensitive, the owner can also promote or redeploy the earlier good Pages deployment directly from the Cloudflare dashboard, but the rollback target should still map back to a known repository revision.

After a web rollback, confirm that the public site still serves on `paretoproof.com` and `www.paretoproof.com`, and that both `auth.paretoproof.com` and `portal.paretoproof.com` still load the expected Pages-managed surface. A web rollback should not require any Railway, Neon, or Modal change unless the reverted frontend depended on a newer incompatible API contract.

### API rollback (`api.paretoproof.com`)

The API rollback path belongs to the Railway project `ParetoProof API`, service `api`. Roll back by redeploying the last healthy Railway deployment for that service or by redeploying the matching earlier repository revision against the same service boundary. Keep `api.paretoproof.com` attached to the same Railway service; rollback is a deployment-history action, not a hostname reassignment.

Because the API owns auth, approvals, and database writes, do not roll the API back past a schema or auth contract change unless the older API revision is still compatible with the current Neon state and Cloudflare Access flow. If the breakage is purely application-level and the database shape is unchanged, prefer the last good Railway deployment. If the breakage spans both code and schema, the owner must confirm database compatibility before restoring older API code. After rollback, verify `/health`, a normal portal bootstrap, and one authenticated API request that touches Neon.

### Worker rollback (`apps/worker`, GHCR, Modal)

The worker rollback path is image-based once at least one worker image exists in GHCR. Roll back workers by pointing the Modal-side worker deployment or job configuration at the last known good image digest or at a previously published stable tag that is already present in the registry, not by rebuilding a new emergency image from an unknown local state. If no successful worker image publish has happened yet, there is no GHCR rollback target and recovery has to start by publishing a known good worker revision first.

Worker rollback should stay isolated from the public API unless the incident came from a shared backend/worker contract change. If the worker image is rolled back independently, keep the API deployment fixed unless the API now expects a newer worker protocol than the restored image can satisfy. When that contract mismatch exists, roll the API and worker back to a matching commit family instead of mixing arbitrary versions.

### Cross-service rule

Database state is not part of the routine rollback surface. Web, API, and worker deploys may roll back independently, but Neon data and migrations are a separate concern and should not be rewound casually during an application incident. If the safest recovery path requires coordinated rollback across web, API, and worker, use one known good repository revision as the anchor and record which platform deployment or image tag was restored for each surface.
