# ADR 0002: MVP Hosting Decision

Status: accepted

ParetoProof needs a hosting layout that keeps the control plane, public web surface, worker runtime, and stored artifacts separate without turning the MVP into an operations project. The accepted hosting decision is to keep the web and edge concerns on Cloudflare, the API on Railway, the structured database on Neon, and the worker runtime on Modal. Large artifacts belong in Cloudflare R2 rather than in Postgres.

The production web surface is served globally through Cloudflare Pages. The control-plane API runs on Railway and is treated as the single application authority for orchestration, authorization, and provider brokering. Neon hosts the Postgres database in `aws-eu-central-1`, which is the primary data region for the MVP. Modal remains the execution layer for remote worker jobs. Cloudflare R2 is the default object store for logs, traces, exports, and other large run outputs.

This split is also the cost decision. The current MVP cost envelope assumes Railway on Hobby at $5 per month, Neon on the free tier until structured data outgrows it, Modal on the Starter plan with the included monthly credit, Cloudflare Pages and Access on the free tier, and R2 charged only when artifact volume appears. That keeps the fixed monthly floor low while leaving room for bursty compute and artifact growth later.

This decision is deliberately conservative about scope. It does not create live deployments by itself, and it does not commit the project to any one deployment cadence. It only fixes which platform owns which responsibility so downstream execution issues can stop re-deciding the hosting stack.
