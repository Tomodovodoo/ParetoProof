# Architecture

ParetoProof has three user-facing web surfaces and one worker/control-plane backbone.

- `paretoproof.com` is the public site for project context and released benchmark reporting.
- `auth.paretoproof.com` plus provider-specific auth hosts handle sign-in and access-request entry.
- `portal.paretoproof.com` is the authenticated contributor and admin workspace.
- `api.paretoproof.com` is the Fastify control plane for state, authz, ingest, and worker coordination.

Execution is intentionally split away from the browser.

- `apps/api` owns control-plane state and contracts.
- `apps/web` owns the public site, auth entry UI, and portal UI.
- `apps/worker` owns package materialization, local attempts, offline ingest, and the hosted claim loop.

The current benchmark kernel is the repository-owned `benchmarks/firstproof/problem9` slice. Public reporting is narrow, and deeper run evidence stays in the portal or worker artifacts instead of the public site.
