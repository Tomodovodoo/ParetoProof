# Artifact Signed Upload and Download Flow Baseline

This document defines the MVP signed upload and download flow for ParetoProof artifacts stored in Cloudflare R2.

The goal is to let workers and authorized humans move artifact bytes without spreading long-lived R2 credentials through browsers, job payloads, or ordinary worker runtime state.

## Core decision

The MVP default is:

- the API owns artifact registration and transfer authorization
- workers receive short-lived signed upload material from the API
- browsers and admins receive short-lived signed download material from the API
- long-lived R2 access keys stay out of normal browser and worker flows

This keeps the artifact transfer boundary consistent with the worker bootstrap and per-job token model that already exists elsewhere.

## Hard rules

The signed transfer model follows eight hard rules:

- browsers never receive long-lived object-storage credentials
- workers never receive broad long-lived R2 credentials by default
- artifact bytes move directly between the caller and R2 once the API has authorized the transfer
- signed transfer grants are short-lived and artifact-specific
- upload authorization is tied to artifact rows that already exist in Postgres
- terminal run success must not be accepted until every required referenced artifact verifies as `available`
- signed downloads are allowed only for artifacts already marked `available`
- direct worker-held R2 credentials remain an explicit exception path, not the default MVP flow

## Credential boundary

### Browser callers

Human callers authenticate to the API with the normal portal or admin identity path. They do not talk to R2 directly until the API issues a short-lived signed download grant for one artifact.

### Worker callers

Workers authenticate to the API with:

- `WORKER_BOOTSTRAP_TOKEN` only for claim
- short-lived per-job token for artifact-related actions after claim

Workers should not hold shared environment-wide R2 credentials just to upload routine run artifacts.

### API runtime

The API is the component that:

- creates artifact rows
- allocates bucket plus object-key locators
- mints short-lived signed transfer material
- validates artifact availability before terminal state promotion

The API therefore owns the only normal runtime capability that can authorize arbitrary artifact transfers.

## Upload flow

The default worker upload path is a five-step flow.

### 1. Register the artifact manifest

The worker first calls `internal.worker.artifact-manifest.submit` with:

- artifact roles
- relative paths
- `sha256`
- `byteSize`
- media metadata
- `requiredForIngest`

The API responds by:

- creating or reusing `registered` artifact rows
- allocating `bucketName`, `objectKey`, and `prefixFamily`
- returning stable `artifactId` values
- returning signed upload grants for any rows that still need object upload

This keeps artifact ids, object locators, and signed upload authority bound together from the first registration round trip.

### 2. Upload directly to R2

The worker uploads the file body directly to R2 using the signed upload grant.

The signed upload grant is artifact-specific and should contain only the information needed for that one object:

- `artifactId`
- HTTP method
- signed URL
- required request headers
- expiration timestamp

The grant must not authorize:

- a second artifact id
- bucket listing
- arbitrary prefix writes
- object deletion

### 3. Reissue on expiry if needed

If an upload grant expires before use, the worker may reissue it by retrying the same artifact-manifest submission while the artifact row is still `registered`.

Manifest submission is therefore idempotent not only for artifact-row creation, but also for short-lived upload-grant refresh.

### 4. Finalize through terminal submission

The MVP does not need a separate public artifact-finalize route.

Instead, the worker finishes the attempt through:

- `internal.worker.result.submit`, or
- `internal.worker.failure.submit`

and references the uploaded `artifactId` values there.

When the API receives the terminal submission, it verifies the referenced artifact rows against R2 before accepting the terminal state.

### 5. Promote lifecycle state

For every referenced artifact:

- if the object exists and matches the stored `sha256` plus `byteSize`, promote `registered -> available`
- if the object is absent, promote `registered -> missing`
- if the object exists but does not match the contract, promote to `quarantined`

The API must reject terminal success if any required referenced artifact fails this verification.

Terminal failure may still be accepted when only a partial artifact set exists, but any referenced artifact must still pass the same availability or mismatch checks.

## Download flow

The default download path is API-mediated and authorization-aware.

### 1. Human or service caller requests one artifact

The caller asks the API for download access to one concrete `artifactId` or equivalent route-scoped artifact resource.

The API first validates:

- caller authorization
- artifact ownership and visibility policy
- `lifecycleState=available`

### 2. API mints a short-lived signed GET grant

If the request is authorized, the API returns one artifact-specific download grant:

- signed GET URL
- optional response-header hints such as content disposition
- expiration timestamp

The signed grant should cover one object only. It must not act like a reusable bucket credential or a prefix-level read grant.

### 3. Caller downloads directly from R2

The browser or service then fetches the object directly from R2 using the signed URL.

This keeps large artifact egress off the API while still letting the API enforce access policy first.

## Worker-side signed reads

Workers may also consume signed GET grants when they need controlled read access to an artifact body owned by the control plane, for example:

- immutable benchmark-source payloads stored in R2
- prior export bundles used for a review or replay workflow

The same rule applies: workers should receive one short-lived artifact-specific read grant, not a general bucket credential.

## Signed grant policy

### Upload grants

The MVP default upload-grant lifetime is 15 minutes.

That is long enough for ordinary artifact uploads and short enough that an abandoned grant does not become a standing credential. A still-valid job token may obtain a fresh upload grant through idempotent manifest resubmission.

### Download grants

The MVP default download-grant lifetime is 5 minutes.

Downloads are read-only and usually start immediately after the caller clicks or requests them, so the window should be shorter than upload grants.

### Grant binding

Every signed grant must be bound to:

- one `artifactId`
- one HTTP method
- one object locator
- one expiration timestamp

The grant should also echo the expected object metadata where the signing format supports it, such as content type or exact object key.

## Verification rules

### Canonical integrity contract

The signed transfer flow must preserve the checksum and size rules from `artifact-reference-fields-baseline.md`.

That means:

- the file bytes hashed in the manifest
- the file bytes uploaded to R2
- the file bytes later downloaded from R2

must remain the same canonical object body for MVP.

### No hidden transcoding

The API must not sign a flow that recompresses, transcodes, or rewrites the artifact body in flight.

The stored object must continue to match the registered:

- `sha256`
- `byteSize`
- `contentEncoding`

### Availability before download

The API must not issue a download grant for artifacts in:

- `registered`
- `missing`
- `quarantined`
- `deleted`

Only `available` artifacts are downloadable.

## Route and scope implications

### Worker surface

The signed upload path should remain inside the existing worker-control boundary:

- manifest submit registers the artifacts and returns upload grants
- result or failure submit finalizes the attempt and forces artifact verification

This keeps upload authorization inside the existing job-token model instead of inventing a second worker credential system.

### Human portal and admin surface

The download path belongs to the human API surface because the API must decide whether the current identity is allowed to read that artifact before issuing a signed grant.

The browser should never derive artifact download rights from raw bucket or key knowledge.

## Exceptional direct-R2 worker path

Some future worker modes may still need direct R2 credentials, for example very large or provider-specific transfer workflows.

That path is allowed only as an explicit exception when:

- the deployment attaches the dedicated `paretoproof-worker-artifacts-<environment>` Modal Secret
- the worker mode cannot reasonably rely on API-minted signed material
- the control-plane contract still preserves the same artifact rows, checksums, and lifecycle verification

Even in that exceptional mode:

- the worker must not receive human download privileges
- the worker must not treat R2 as its own source of truth
- artifact rows and lifecycle state in Postgres remain authoritative

## Out of scope

- multipart or resumable upload protocols
- CDN caching strategy for artifact downloads
- public or anonymous artifact links
- final visibility and retention policy decisions from issue `#125`
- exact Fastify route shapes or implementation code
