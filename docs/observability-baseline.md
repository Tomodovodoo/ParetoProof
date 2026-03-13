# Observability Baseline

This document resolves the MVP observability scope for ParetoProof. It defines what to collect, where signals live, and which dashboards and alerts should exist first.

## Baseline stack

The MVP stack is platform-native-first with minimal additional tooling.

- API logs and basic service metrics: Railway
- Worker logs and execution metrics: Modal
- Database health metrics: Neon
- Edge request analytics and WAF/rate-limit events: Cloudflare
- Long-lived run artifacts (logs/traces bundles): Cloudflare R2

Cross-service tracing can be added later. MVP should not block on a full OpenTelemetry pipeline.

## Signal inventory

### Logs

Required log streams:

- API request logs with route, status, latency, and request id
- API auth/authorization decision logs for portal and admin routes
- Worker lifecycle logs (`claim`, `heartbeat`, `start`, `complete`, `fail`, `cancel`)
- Artifact operation logs (register/upload/finalize events)
- Admin actions that mutate contributor or run-control state

Log requirements:

- structured JSON format for API and worker processes
- include `trace_id`/`request_id` correlation identifiers when available
- redact secrets and tokens before emission
- keep high-volume per-step model output in R2 artifacts rather than hot log storage

### Metrics

Required MVP metrics:

- API request rate, p95 latency, error rate (5xx and authz failures)
- API uptime and restart/crash counts
- worker claim success rate, active jobs, job-failure rate, heartbeat timeout count
- queue depth or pending-job count (when queue is introduced)
- Neon connection usage, storage growth, query latency, and CPU saturation indicators
- Cloudflare edge 4xx/5xx trends and Access denial rates

### Traces

MVP trace baseline:

- keep route-level latency and request-id correlation from logs
- preserve worker execution traces as artifact bundles in R2 (`runs/<run_id>/traces/`)
- defer distributed tracing backend adoption to later execution issues

## First dashboards

Create these dashboards first:

1. Control Plane Health
- API request volume, p95 latency, 5xx rate, uptime
- auth-denied vs approved portal bootstrap outcomes

2. Worker Reliability
- jobs claimed, jobs completed, jobs failed, heartbeat timeouts
- median and p95 job duration by benchmark type (when available)

3. Data and Artifact Health
- Neon connection and storage trends
- R2 artifact write/read error rates and object growth

4. Edge and Access Health
- Cloudflare Access denials, edge 5xx, WAF/rate-limit trigger counts

## First alert set

MVP alerts should be actionable and low-noise.

Critical alerts:

- API health endpoint failing for sustained window
- API 5xx rate above threshold for sustained window
- worker heartbeat timeout spike beyond baseline
- worker claim failures sustained (workers cannot receive work)
- Neon connection saturation risk

Warning alerts:

- elevated Access denials beyond expected policy pattern
- artifact upload failure rate increase
- unusual restart frequency for API or workers

Alert routing:

- owner-admin receives critical alerts immediately
- warnings are batched unless sustained or correlated with user-facing impact

## Cost and rate-limit monitoring scope

Cost and quota tracking is required in MVP even if billing automation is not yet built.

Track at minimum:

- Railway usage trend (service runtime/resources)
- Modal compute usage trend by worker environment
- Neon storage and compute consumption trend
- Cloudflare request and egress trends relevant to Pages, Access, and R2
- any provider-side hard quota or rate-limit event count

Rate-limit monitoring:

- detect API 429 patterns by route and caller class
- detect Cloudflare edge limit/WAF events that block legitimate portal traffic
- record worker-side upstream provider throttling events where applicable

## Ownership and runbooks

- owner-admin is the initial incident owner for critical observability alerts
- each alert should map to a short runbook entry (detection, first triage step, rollback/safe-mode action)
- runbook links should live with infrastructure docs once execution issues implement dashboards/alerts

## Execution-ready follow-up tasks

Create execution issues for:

- structured logging contract for API and worker services
- dashboard implementation across Railway, Modal, Neon, and Cloudflare
- initial alert rules and routing policy
- cost/quota trend collection and weekly review workflow
- correlation-id propagation from edge to API to worker logs

## Out of scope

- implementing a full distributed tracing backend now
- introducing heavy observability vendors before MVP reliability needs it
- setting final numeric alert thresholds in this scope issue
