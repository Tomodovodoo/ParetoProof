# Worker Data Freshness And Failure UX Baseline

This document defines how ParetoProof frontend surfaces consume private worker-operations data and public reporting data once those surfaces are wired to real APIs.

It closes issue #948 by fixing the frontend data contract for freshness, polling or revalidation, cache invalidation, stale-state banners, empty states, and failure handling. It is a scope and product-contract baseline, not the implementation of frontend hooks or backend schemas.

## Current Ground Truth

The surrounding hosted-worker baselines already decide the API boundaries this document consumes:

- [hosted-worker-private-operator-api-baseline.md](./hosted-worker-private-operator-api-baseline.md) defines the authenticated private worker-ops freshness envelope.
- [hosted-worker-public-reporting-api-baseline.md](./hosted-worker-public-reporting-api-baseline.md) defines the public release-centric freshness and cache posture.
- [portal-worker-operations-live-ia-baseline.md](./portal-worker-operations-live-ia-baseline.md) defines how worker-ops routes present live, stale, degraded, empty, failed, and partial data.

The current code has useful route-level refresh scaffolding, but it does not yet have the data contract this baseline requires:

- `packages/shared/src/contracts/portal-live-freshness.ts` defines manual versus polling route policy.
- `apps/web/src/lib/portal-freshness.ts` and `PortalFreshnessCard` currently derive freshness from browser-side `lastUpdatedAt`.
- `GET /portal/workers` currently returns `generatedAt`, queue summary, pools, leases, and incidents, but not the full private freshness envelope.
- public benchmark pages currently use static release-summary data rather than `/public/reporting/*` API payloads.

The important correction is that browser fetch time is not data freshness. Browser fetch lifecycle can say when the browser last received a response. The API must say what that response represents and whether its underlying read model is live, stale, degraded, or a publication snapshot.

## Scope

In scope:

- private portal worker-ops freshness and failure UX
- public reporting freshness and failure UX
- polling, manual refresh, public revalidation, and cache invalidation rules
- shared state vocabulary for loading, empty, stale, degraded, failed, unauthorized, rate-limited, and offline states
- follow-up ownership for #956, #949, #950, #953, #954, #955, and #957

Out of scope:

- implementing frontend data hooks
- defining backend database tables or indexes
- changing private worker API object fields already scoped in #945
- changing public reporting payload fields already scoped in #946
- wiring portal or public pages to real APIs
- adding a generic application-wide cache framework

## Ownership Layers

ParetoProof should keep four concepts separate.

| Layer | Owner | What It Decides | What It Must Not Decide |
| --- | --- | --- | --- |
| API data freshness | backend/control plane | whether a returned private snapshot is `live`, `stale`, or `degraded`; publication metadata for public snapshots | browser fetch lifecycle |
| browser request lifecycle | web app | loading, refreshing, failed request, retry, offline pause, last successful response | truthfulness of the returned data |
| route refresh policy | shared contracts plus web app | when to poll, refresh, revalidate, pause, or back off | payload shape or public/private redaction |
| visible UX state | route UI | banners, empty states, partial section fences, retry affordances, action gating | backend freshness classification |

## Private Portal Freshness

Private worker-ops read responses should expose the freshness envelope from the private operator API baseline:

```ts
type PrivateWorkerOpsFreshness = {
  generatedAt: string;
  observedThrough: string | null;
  freshnessStatus: "live" | "stale" | "degraded";
  staleAfterSeconds: number;
  recommendedPollAfterSeconds: number;
  degradationReason: string | null;
};
```

Definitions:

- `generatedAt` is when the API assembled the response.
- `observedThrough` is the newest authoritative timestamp included in the read model.
- `freshnessStatus` is the backend-owned state the portal renders.
- `staleAfterSeconds` is the freshness window used by the API to classify the snapshot.
- `recommendedPollAfterSeconds` is backend guidance, bounded by frontend route policy.
- `degradationReason` is nullable human-safe context for degraded snapshots.

Rules:

- `generatedAt` alone is never proof that the data is fresh.
- `observedThrough` is the timestamp the portal should show for operational recency.
- the browser may re-render timers from local time, but must not reclassify `live`, `stale`, or `degraded`.
- private worker-ops data should remain memory-only in the browser and should not be persisted to local storage.
- authenticated private worker-ops routes should use a no-store cache posture unless a later security review explicitly approves otherwise.

## Public Reporting Freshness

Public reporting uses release and snapshot semantics, not worker-health semantics.

Public detail responses should expose:

```ts
type PublicReportingFreshness = {
  generatedAt: string;
  publishedAt: string | null;
  snapshotVersion: string;
  recommendedRevalidateAfterSeconds: number;
};
```

Public list responses may use `newestPublishedAt` instead of a single `publishedAt`:

```ts
type PublicReportingListFreshness = {
  generatedAt: string;
  newestPublishedAt: string | null;
  snapshotVersion: string;
  recommendedRevalidateAfterSeconds: number;
};
```

Rules:

- public reporting must not expose private `live`, `stale`, or `degraded` fleet wording.
- public release detail pages should behave like immutable snapshots keyed by release or report id plus `snapshotVersion`.
- public list pages may revalidate to discover newly published, withdrawn, or superseded releases.
- public failure copy should talk about releases, reports, and snapshots, not queues, workers, leases, incidents, or rollouts.
- public pages must never derive themselves by calling private `/portal/*` worker-ops routes.

## Route Policy

Private worker-ops routes and public reporting routes use different refresh policies.

| Surface | Route Family | Refresh Mode | Cache Posture | Primary UX Obligation |
| --- | --- | --- | --- | --- |
| private portal | `/workers` overview | poll with API recommendation bounded by frontend route policy | authenticated no-store | show live/stale/degraded status and preserve last useful data |
| private portal | `/workers/*` drill-down routes | poll or manual refresh based on route risk and API recommendation | authenticated no-store | keep resource-specific stale/degraded context visible |
| public site | `/benchmarks` or release index backed by `/public/reporting/releases` | revalidate on navigation, focus, and recommended interval | public cache-friendly | discover new, withdrawn, or superseded releases |
| public site | release/report detail backed by `/public/reporting/*/:id` | immutable snapshot fetch with optional revalidation by snapshot version | public cache-friendly | render release state without implying live telemetry |

Private polling rules:

- trigger an initial fetch on mount for live private routes.
- avoid overlapping requests for the same route key.
- pause background polling while the tab is hidden.
- pause background polling while the browser is offline.
- resume with an explicit refresh when the browser returns online or a long-hidden tab becomes visible.
- honor `429` retry guidance.
- keep manual refresh available when the route policy allows it.

Public revalidation rules:

- do not tight-poll public detail pages.
- revalidate public list pages on navigation, focus, and a cache-friendly timer.
- preserve current public content during revalidation unless the API proves it was withdrawn, superseded, or no longer available.
- prefer `snapshotVersion`, `ETag`, or equivalent response-version checks once #956 and #950 implement them.

## Client State Vocabulary

Frontend clients should distinguish these states rather than collapsing them into generic loading or unavailable cards.

| State | Meaning | Private Portal Behavior | Public Reporting Behavior |
| --- | --- | --- | --- |
| `initial_loading` | no prior data and request is in flight | show route shell and loading copy | show public shell and release/report loading copy |
| `ready` | successful response is available | render content plus API freshness state | render release/report content plus snapshot metadata |
| `empty` | successful response has no matching rows | explain what would normally appear | explain no public releases or reports are available |
| `refreshing` | prior data exists and refresh is in flight | keep prior data visible | keep current public content visible |
| `refresh_failed_with_data` | refresh failed but prior data exists | show retry and old `observedThrough` | show retry without implying live telemetry |
| `failed_without_data` | no usable data exists | show route-specific unavailable copy and retry | show release/report unavailable or request-failed copy |
| `unauthorized` | auth expired, missing, or forbidden | clear private data and route through auth handling | usually not applicable to public pages |
| `rate_limited` | API returned retry guidance | show retry-after guidance and pause polling | show retry-after guidance and pause revalidation |
| `offline_paused` | browser is offline or polling paused | keep prior data with offline notice | keep current public content with offline notice |

Private worker-ops responses then add the data status:

- `live`
- `stale`
- `degraded`

Public reporting responses then add release/report states:

- `release_unavailable`
- `release_withdrawn`
- `snapshot_superseded`
- `revalidating`

## Private Worker UX Rules

| State | Read Content | Drill-Down Links | Refresh | Dangerous Mutations |
| --- | --- | --- | --- | --- |
| `live` | show normally | enabled | enabled | allowed if normal preflight passes |
| `stale` | keep data visible with stale banner | enabled | emphasized | allowed only with explicit caution or fresh preflight |
| `degraded` | show valid sections and fence impaired sections | enabled for valid linked resources | emphasized | blocked when missing data affects safe preflight |
| refresh failed with prior data | keep prior data and old `observedThrough` | enabled where ids are present | emphasized | blocked unless the mutation performs its own fresh preflight |
| failed initial load | no route data | disabled except stable navigation | enabled | blocked |
| empty success | show empty state | no data-specific links | enabled | usually blocked unless the action creates new work |

Private worker UI rules:

- stale data should not disappear just because it is old.
- degraded data should not become a full-page failure when some sections remain valid.
- section-level failures should fence only the affected section.
- admin mutation affordances should be suppressed when freshness or degradation prevents safe preflight.
- mobile layouts must keep freshness, incident severity, stale leases, and rollout blockers visible early in the route.

## Public Reporting UX Rules

Public reporting should stay release-centric.

List pages:

- show released, withdrawn, and superseded states when returned by the API.
- preserve the existing list during revalidation.
- show an empty state only when the API succeeds and returns no public releases or reports.
- avoid any worker-health vocabulary.

Detail pages:

- render one release or report snapshot.
- show publication timestamp and snapshot version where useful.
- show `release_unavailable` when the id does not resolve to a public release.
- show a publication-state warning for withdrawn or superseded releases.
- link back to the public index on unavailable or withdrawn states.

Public reporting must not expose:

- worker ids or worker pools
- queue depth or backlog posture
- run, job, attempt, or lease lineage
- incidents or rollouts
- private operator notes
- unreleased benchmark material

## Invalidation Rules

| Trigger | Private Portal Behavior | Public Reporting Behavior |
| --- | --- | --- |
| route or params change | fetch route-specific data and ignore stale in-flight responses | fetch target release/report or list |
| manual refresh | refresh current route and keep prior data until success | revalidate current public payload |
| successful private mutation | refresh affected detail route and parent overview | not applicable |
| auth expiry or access downgrade | clear private data and route through auth handling | not applicable |
| browser returns online | refresh if data existed or route is live | revalidate public list/detail if stale by policy |
| hidden tab becomes visible | refresh when elapsed time exceeds route threshold | revalidate public list by policy |
| `429` response | pause polling until retry window | pause revalidation until retry window |
| public snapshot version change | not applicable | replace cached snapshot and mark superseded state when supplied |
| public withdrawal or supersession | not applicable | render publication-state warning and refresh affected indexes |

## Relationship To Follow-Up Issues

| Issue | Responsibility After This Baseline |
| --- | --- |
| #956 | add shared freshness, revalidation, result-state, response-version, and invalidation contracts |
| #949 | add private worker-ops payload support for backend-owned freshness metadata |
| #950 | add public reporting routes with snapshot metadata and cache headers |
| #953 | wire portal worker overview to private API freshness and failure UX |
| #954 | wire portal worker detail, rollout, and incident panels without re-deciding freshness semantics |
| #955 | wire public reporting pages to public APIs and release-centric load/failure states |
| #957 | provide redaction-safe public aggregate derivation so public routes do not query private operator data directly |

Implementation guidance:

- #956 should keep private and public metadata schemas separate.
- #953 should not globally rewrite `PortalFreshnessCard` before API-owned freshness is available, because that component is reused by profile, admin, access-request, shell, and benchmark-ops surfaces.
- #953 may use a worker-ops-specific wrapper or additive freshness props first, then consolidate when multiple routes share the same API-owned shape.
- #955 should replace static public reporting data only after #950 exposes release-centric public routes.

## Acceptance Criteria

This baseline is complete when:

- private and public freshness vocabularies are explicitly different.
- browser fetch time is not confused with API-owned data freshness.
- stale, degraded, empty, failed, unauthorized, rate-limited, and offline states are distinct.
- private polling and public revalidation policies are defined.
- private and public invalidation triggers are defined.
- portal action gating under stale or degraded data is defined.
- public withdrawal, supersession, and unavailable-snapshot behavior is defined.
- follow-up ownership is clear for #956, #949, #950, #953, #954, #955, and #957.

## Stop Rules

Stop the #948 PR before adding code when this document is accepted and linked from `docs/README.md`.

Do not add frontend hooks, backend schemas, API routes, a generic caching framework, or a global freshness-card rewrite in the #948 PR. Those belong to the execution issues listed above.
