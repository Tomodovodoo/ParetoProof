# ADR 0001: MVP Implementation Stack

Status: accepted

ParetoProof needs a stack that is easy to reason about across frontend, backend, and workers without turning the MVP into a collection of unrelated runtimes and tools. The project also needs a structure that fits the hosting decisions that have already been made.

The accepted MVP implementation stack is TypeScript across the repository, Bun for workspaces and package execution, React with Vite for the web application, Fastify for the API, and Drizzle for schema, migrations, and typed database access. Neon remains the managed Postgres host. Cloudflare hosts the web surfaces, Railway hosts the API, Modal hosts workers, and Cloudflare R2 stores large artifacts outside Postgres.

This decision intentionally separates the language and package-management choice from the deployed runtime choice. Bun is the monorepo tool, but the containerized API and worker services are still expected to follow the safer Node-compatible production path until a Bun-specific runtime benefit is strong enough to justify changing that assumption.

This also leaves some decisions open on purpose. Styling and component-stack choices are still separate from the React and Vite decision. Exact Docker image contents are deferred to a dedicated scope issue. The exact test stack is also deferred to a dedicated scope issue so it can be chosen in one place instead of being implied by early scaffolding.
