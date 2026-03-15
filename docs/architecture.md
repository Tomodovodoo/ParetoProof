# Architecture

ParetoProof has four user-facing web surfaces and one worker/control-plane backbone.

- `paretoproof.com` is the public site for project context and released benchmark reporting.
- `auth.paretoproof.com` plus provider-specific auth hosts handle sign-in and access-request entry.
- `portal.paretoproof.com` is the authenticated contributor and admin workspace.
- `math.paretoproof.com` is the authenticated math workflow surface for question, submission, review, and question-centric launch work.
- `api.paretoproof.com` is the Fastify control plane for state, authz, ingest, and worker coordination.

Public benchmark reporting stays on the apex site. Generic operational and execution views stay behind the portal and worker surfaces. Math workflow gets its own authenticated surface rather than growing as a sidecar inside the portal.

Execution is intentionally split away from the browser.

- `apps/api` owns control-plane state and contracts.
- `apps/web` owns the public site, auth entry UI, portal UI, and math UI.
- `apps/worker` owns package materialization, local attempts, offline ingest, and the hosted claim loop.

The current benchmark kernel is the repository-owned `benchmarks/firstproof/problem9` slice. Public reporting is narrow, and deeper run evidence stays in the portal or worker artifacts instead of the public site.
