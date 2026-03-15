# Hosted Worker Isolation And Artifact Boundaries Baseline

This document defines the hosted-worker workspace isolation, filesystem policy, artifact staging flow, and quarantine boundary for ParetoProof.

The goal is to stop hosted execution from treating the worker filesystem as an implicit evidence store or a trusted continuation surface between jobs, and instead make every writable path and artifact transition an explicit control-plane policy decision.

## Current baseline

The hosted-worker kernel already establishes some of the right pieces:

- the hosted worker platform baseline treats Modal local disks and scratch paths as non-durable execution substrate
- worker lifecycle and lease recovery already assume stale or unsafe workers can be fenced and recovered
- artifact lifecycle already distinguishes `registered`, `available`, `missing`, `quarantined`, and `deleted`
- hosted execution already assumes artifacts become authoritative only through control-plane-owned artifact rows and signed object-storage intents

What is still missing is the accepted answer to:

- which paths inside a hosted worker are writable at all
- how one job's files are prevented from leaking into the next job
- when output is only local scratch versus a staged artifact candidate
- what must happen before bytes are allowed to leave the worker boundary
- how suspicious or policy-blocked output is fenced off from normal evidence and release flow

Without that boundary, later implementation work will drift into "write wherever the container allows" and "upload whatever seems useful," which is not a trustworthy hosted execution model.

## Decision

ParetoProof should treat every hosted job as running inside a per-lease isolated workspace with one-way promotion from scratch data to staged artifact candidates to control-plane-authorized artifact uploads.

The accepted design rule is:

1. a worker may write only to the current lease's explicitly assigned scratch and staging paths
2. no writable path is shared across concurrent leases
3. local filesystem output is untrusted until it is mapped onto pre-registered artifact identities and verified through the control plane
4. suspicious, mismatched, or policy-blocked output must stop at a quarantine boundary and never become normal downloadable evidence automatically
5. lease completion or recovery must leave the worker with no reusable job residue except explicitly retained operator incident evidence

Hosted workers therefore use local files to execute jobs, not to create a silent side channel around artifact policy.

## Isolation model

The authoritative isolation unit is one lease-scoped job workspace.

Every active lease must get:

- one unique workspace root
- one unique staging root for candidate artifacts produced by that lease
- one unique temporary runtime path for caches or tool scratch that may exist only for that lease lifetime

No two active leases may share the same writable root, even when:

- they target the same run
- they use the same benchmark package
- they are served by the same worker process
- one lease is a retry or recovery of earlier work

Isolation is lease-scoped rather than run-scoped because recovery and retry need a hard boundary between old and new execution attempts.

## Filesystem posture

The accepted filesystem posture for hosted workers is:

- read-only code and image layers
- read-only mounted secrets and bootstrap material
- lease-scoped writable scratch
- lease-scoped writable staging
- no shared writable cache that can influence correctness across unrelated leases unless a later scope explicitly approves it

Hosted workers must not depend on mutable shared directories for:

- benchmark package source of truth
- prompt package source of truth
- candidate source persistence across jobs
- artifact evidence retention

If a later optimization wants a reusable cache, it must be explicitly bounded, reproducibility-safe, and ignorable without affecting the canonical execution contract. MVP should assume no trusted cross-job writable cache.

## Required path classes

Each hosted worker lease may use only these logical path classes.

### 1. Lease workspace root

Purpose:

- unpack benchmark and prompt inputs for that lease
- materialize candidate source and run-local generated files
- hold tool outputs while the job is still executing

Rules:

- unique per lease
- writable only for the active lease
- deleted or securely reset after lease cleanup unless incident hold says otherwise

### 2. Lease staging root

Purpose:

- collect files that are candidates for artifact-manifest submission
- separate "possible evidence" from arbitrary runtime scratch

Rules:

- unique per lease
- populated only by files the worker intentionally maps to registered artifact identities
- must not be treated as durable evidence on its own

### 3. Lease temporary scratch

Purpose:

- compiler temp files
- decompression or preprocessing scratch
- transient logs or traces not yet promoted to artifact candidates

Rules:

- may be discarded aggressively
- must never be referenced directly by portal or API read models
- may not survive lease cleanup unless explicitly copied into incident-hold evidence through an operator-controlled path

### 4. Read-only package mount or extraction area

Purpose:

- expose benchmark package and prompt package inputs

Rules:

- must be read-only from the perspective of the lease
- package bytes may be copied into lease-local writable scratch for tool compatibility, but the canonical package source remains immutable

## Cleanup guarantees

Cleanup is a required lifecycle step, not an optional best-effort optimization.

The accepted cleanup guarantees are:

- a successfully completed lease must leave no writable residue that can influence a later unrelated lease
- a recovered, revoked, or expired lease must be fenced from further writes before cleanup starts
- cleanup failure is itself an operator-visible incident condition and must block the worker from returning to healthy serving capacity

There are only two accepted post-lease outcomes for writable local data:

- deleted from the worker
- copied into an explicitly retained incident-hold or quarantined artifact path governed by the control plane

Silent survival of local residue across leases is out of bounds.

## Artifact staging boundary

Local files become product artifacts only through an explicit staging contract.

The accepted staging flow is:

1. the control plane already knows the allowed artifact identities for the lease through pre-registered artifact rows or a manifest envelope
2. the worker writes candidate output into lease-local workspace or scratch paths
3. the worker copies or links only the intended artifact files into the lease staging root
4. the worker maps each staged file to one registered artifact id with the expected path, media metadata, and checksum contract
5. the control plane authorizes upload intents only for those registered artifact ids
6. verified object-storage upload promotes the artifact row through the normal lifecycle

The local staging root is therefore the worker-side boundary between arbitrary execution output and control-plane-tracked evidence.

## What may become a staged artifact

Only files that fit one of these classes may cross from scratch into staging:

- canonical run-attempt evidence already approved by the worker-control and artifact baselines
- deterministic execution diagnostics intentionally defined as artifact classes
- explicit derived export or supportability objects requested by a later approved workflow

Files may not cross from scratch into staging merely because they are present or seem interesting. Every staged file needs:

- one known artifact class
- one known owner scope
- one registered artifact id
- one policy-compatible media and retention posture

## Quarantine boundary

Quarantine begins before object storage if the worker or control plane can already tell the output is not safe for normal evidence flow.

The accepted quarantine triggers are:

- staged file does not match the registered artifact identity or expected relative path
- checksum, size, media type, or content encoding contract fails
- output includes forbidden residue from benchmark-owned or secret-bearing paths
- output class is not approved for the lease's current workflow
- incident policy or operator hold blocks normal promotion

When quarantine triggers:

- the file must not be uploaded into the normal `available` path for that artifact row
- the worker should stop normal artifact promotion for the affected file set
- the control plane must record quarantine reason and artifact identity if known
- any retained bytes must land in a quarantined or operator-only review path, not in the normal downloadable evidence lane

Quarantine is not just an object-storage lifecycle bit. It is the boundary that prevents suspicious local output from quietly becoming portal-visible evidence.

## Unsafe output categories

The hosted worker must fail closed on these output categories:

- files copied from outside the current lease workspace or read-only input boundary
- files that contain injected secret material, bootstrap credentials, or provider tokens
- files whose relative paths attempt directory traversal or namespace escape
- files whose content contract does not match the artifact row the worker claims they represent
- leftover files from a prior lease that were not created under the current lease identity

These outputs are not eligible for normal artifact promotion even if the worker process can technically read them.

## Cross-job residue policy

The worker must assume any unexpected pre-existing writable file inside a new lease workspace is unsafe residue.

The accepted residue policy is:

- the workspace must be created empty or verified empty before lease execution starts
- if unexpected writable residue is detected, the lease should fail closed before normal execution begins
- the worker should transition into an incident or unhealthy posture until cleanup or operator review resolves the residue source

This prevents "best effort reuse" of directories that might carry prior candidate files, outputs, or secrets into later jobs.

## Relationship to lease recovery

Lease recovery and workspace isolation must agree on ownership fencing.

When a lease enters `recovery_pending` or the worker enters `recovering`:

- the old lease workspace stops being an authoritative source for new artifact promotion
- the old staging root must be frozen for that lease
- any later resumed or requeued execution must run in a fresh lease workspace, never by reusing the old writable tree

If operators need to inspect the old workspace, they do so through explicit incident retention or quarantined evidence capture, not by reviving that workspace as a normal execution root.

## Operator and audit implications

The control plane and operator surfaces must be able to explain:

- which worker and lease owned a workspace
- when the workspace was created and cleaned up
- whether cleanup succeeded, failed, or was skipped because of incident hold
- which artifact files were staged, uploaded, quarantined, or dropped
- whether residue or boundary violations were detected

This means the product needs durable metadata for workspace and staging outcomes, even though the actual lease workspace itself is ephemeral.

## Private and public evidence consequences

Normal portal evidence surfaces must only reference artifact rows that cleared the control-plane artifact boundary.

They must never reference:

- raw worker local paths
- lease staging roots
- quarantined scratch directories
- ephemeral runtime logs that were never promoted into approved artifact rows

Public surfaces are even narrower: they may consume only explicitly released artifacts that already cleared private artifact policy and any public redaction rules.

## Relationship to existing baselines

This isolation baseline sharpens, rather than replaces, the surrounding hosted-worker and artifact scopes:

- the hosted worker platform baseline says local disk is not durable evidence; this document defines the lease-scoped writable boundary that makes that true in practice
- the lifecycle baseline fences stale or recovered leases; this document defines what happens to their workspaces and staged files
- the artifact transfer baseline defines persistent artifact lifecycle after registration; this document defines the pre-upload staging and quarantine boundary before bytes are promoted

Those scopes must stay aligned. A file cannot become durable evidence merely because it exists locally, and a recovered lease cannot keep mutating staged output after the control plane fenced it.

## Consequences for follow-up execution

This baseline should directly shape later implementation work:

- hosted workers need explicit per-lease workspace creation and teardown
- artifact upload code must stage only pre-registered artifact identities, not arbitrary file globs
- cleanup failures and residue detections must feed worker health and incident posture
- suspicious or mismatched staged output must enter quarantine or incident review instead of normal availability
- regression coverage should prove cross-job residue, path escape, and secret-bearing output do not pass the staging boundary

## Out of scope

This scope does not:

- implement cleanup jobs, secure deletion primitives, or retention automation
- define the exact object-storage quarantine bucket layout
- redefine offline-ingest storage policy
- define the later operator UI for evidence review or incident bundles

It defines the hosted execution isolation and artifact-boundary contract those later slices must honor.
