# Capacity Baseline

This document resolves the MVP capacity-planning scope for ParetoProof. It defines the initial load assumptions, the first likely bottlenecks, and the rules for when the system should scale vertically, horizontally, or not at all.

## Capacity model

ParetoProof should treat the MVP as a control plane with bursty worker demand, not as a high-traffic consumer web app.

- Public-site and portal traffic are expected to stay low.
- The API is primarily orchestration and state management, not bulk compute.
- Heavy CPU and memory pressure should come from workers, not from Railway.
- Artifact size growth should affect R2 and worker runtime more than Postgres.

The capacity goal is not maximum throughput on day one. The capacity goal is predictable behavior under a small number of concurrent evaluations without prematurely turning the stack into a distributed-systems project.

## Baseline load assumptions

The MVP should assume:

- fewer than 50 interactive portal users in a normal week
- single-digit concurrently active contributors in a normal working session
- one to a few benchmark runs started in a short burst rather than a continuous public queue
- worker concurrency in the low single digits at first, with manual budget control still in place
- artifacts dominated by logs, traces, and result bundles rather than by a high volume of large binary uploads every minute

This means the first production scaling decisions should optimize for burst handling and safe queueing rather than for sustained high request-per-second traffic.

## First likely bottlenecks

The earliest bottlenecks are likely to appear in this order:

### 1. Worker concurrency and external compute budget

The first real ceiling is expected to be worker-side compute, image cold-start time, model-provider cost, or benchmark runtime length. Modal concurrency and per-run budget controls matter earlier than raw API throughput.

### 2. API orchestration throughput

The API can become a bottleneck once worker claim, heartbeat, artifact-registration, and run-state updates become frequent enough to create write-heavy orchestration traffic. This is still more likely to be a coordination problem than a CPU-bound web-server problem.

### 3. Neon write pressure and connection shape

As job heartbeats, run events, role changes, and artifact metadata accumulate, Postgres write volume and connection limits are likely to matter before static web traffic does. Poor query/index choices or too many concurrent worker-side updates will show up here first.

### 4. Artifact transfer and storage growth

Large logs, traces, bundles, or repeated re-uploads can increase worker runtime cost and R2 egress/storage cost even if the API remains healthy. Capacity planning should treat artifact growth as an independent pressure source, not as a simple extension of database growth.

### 5. Human operations bandwidth

Manual approvals, manual launch gating, manual rollback, and manual debugging are part of the MVP operating model. Human review capacity can become a practical bottleneck before infrastructure limits are reached.

## Scaling rules by surface

### Cloudflare Pages (`paretoproof.com`, `auth`, `portal`)

- Assume Pages capacity is not an MVP bottleneck.
- Do not introduce frontend-specific scaling work unless web bundle size, auth-entry latency, or API dependency creates a user-visible problem.
- Frontend optimization should focus on correctness and bundle discipline, not multi-region capacity planning.

### Railway API (`api.paretoproof.com`)

- Scale the API vertically first.
- Keep one control-plane service until real evidence shows that API CPU, memory, or request latency is limiting worker throughput or portal responsiveness.
- Do not split the API into multiple services for capacity reasons during MVP unless one route family is clearly dominating runtime behavior.

Triggers for closer review:

- repeated p95 or p99 latency degradation on normal portal or worker-control routes
- worker polling/heartbeat traffic causing visible contention for admin or portal requests
- memory pressure or restart frequency on the Railway service

### Neon Postgres

- Optimize schema, indexes, and query shape before treating Neon as a raw scale-up problem.
- Use connection discipline and avoid unnecessary long-lived concurrent worker queries.
- Treat high-churn worker events, heartbeat updates, and artifact metadata writes as the main early database pressure points.

Triggers for closer review:

- connection exhaustion or frequent connection spikes
- slow queries on run/job/event tables
- migration/runtime contention during active benchmark windows

### Modal workers

- Scale workers horizontally only through explicit concurrency limits.
- Increase worker parallelism stepwise, not automatically without budget review.
- Prefer a small number of predictable workers over wide fan-out while the run-control model is still stabilizing.

Triggers for closer review:

- growing claim backlog during normal usage
- long queue wait relative to actual benchmark runtime
- cold-start delay dominating total run time
- compute spend rising faster than completed useful evaluations

### R2 artifacts

- Keep artifact classes and retention policies narrow before trying to optimize for very high object volume.
- Treat large or repeated artifact uploads as a worker/runtime concern first.
- Avoid using Postgres as overflow storage for artifact payloads.

Triggers for closer review:

- artifact upload time becoming a material share of job runtime
- bundle/log size growing faster than evaluation count
- restore or retrieval workflows becoming slow or expensive enough to affect normal operations

## Horizontal-scaling guidance

The MVP should follow a simple order of operations:

1. fix obviously wasteful query, artifact, or worker-runtime behavior
2. raise worker concurrency carefully when budget and queue pressure justify it
3. raise API or database capacity only after real control-plane contention appears
4. split services only after one surface has a demonstrated scaling pattern that the current boundary cannot absorb

Horizontal scaling is mainly a worker concern during MVP. API and database scaling should stay conservative until the workload actually proves otherwise.

## Capacity review checkpoints

Revisit the baseline when any of these become true:

- more than one benchmark campaign is running concurrently in a routine way
- contributor launches are no longer manually gated by a small trusted group
- worker concurrency moves beyond low single digits
- run-event and artifact volume makes one-day operational debugging noticeably slower
- API or DB incidents are caused by normal workload rather than by bugs or bad deploys

## Out of scope for this decision

- exact autoscaling policies for Modal
- cost forecasting beyond the current MVP hosting assumptions
- load-testing framework choice
- multi-region database or active-active control-plane design
- public self-serve job submission at internet scale
