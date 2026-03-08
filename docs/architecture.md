# Architecture

ParetoProof is being built as a small set of separate deployable services that share one data model and one evaluation workflow. The web layer is responsible for the public site and the authenticated portal. The API layer owns application logic, orchestration, permissions, run state, and data access. The worker layer executes Lean and model-related jobs without exposing that execution model directly to the browser.

For the MVP, the repository is intentionally centered on one language family. TypeScript is the default language across the web app, API, worker control code, and shared contracts. Bun is the workspace tool that holds the monorepo together, but the deployed API and worker services are still expected to target the conservative Node-compatible runtime path inside containers.

The web application is a React application built with Vite. That keeps the frontend straightforward and works cleanly with Cloudflare-hosted deployment. The API is a Fastify service because it gives the project a predictable TypeScript backend without adding unnecessary framework surface area. Database schema, migrations, and typed queries are handled with Drizzle, while Neon remains the managed Postgres host rather than the schema tool itself.

Operationally, the system is split in a way that matches risk. Cloudflare serves the public and gated web surfaces. Railway runs the control-plane API. Modal runs workers so compute can scale separately from the API. Neon stores structured application data, and Cloudflare R2 is reserved for larger artifacts such as logs, traces, exported bundles, and other run outputs that should not live inside Postgres.

This means the browser talks to the API, the API owns the authoritative state, and workers report back through defined contracts rather than acting like a second backend. That separation is the core architectural rule the repository now assumes.

The intended data flow follows the same pattern. The public site and portal are both web surfaces, not data authorities. Requests that need application state go to the API. The API reads and writes Postgres, coordinates worker work, and decides which artifact references belong in the database and which raw files belong in R2. Workers execute jobs, report progress and results back to the API, and upload large outputs through the artifact path defined by the backend. GHCR is the image distribution path for containerized services, not a source of runtime truth by itself.
