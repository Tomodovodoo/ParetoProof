# Benchmark Product Objects Baseline

This document defines the first-class product objects that should exist above the current run, job, attempt, and artifact kernel.

The goal is to stop later benchmark work from spreading across ad hoc route params, report pages, and launch forms without one durable object model tying them together.

## Current baseline

The repository already has a real execution kernel:

- benchmark package and prompt package materialization
- launch preflight inputs such as `benchmarkVersionId`, `modelConfigId`, and `runKind`
- durable `runs`, `jobs`, `attempts`, and `artifacts`
- private portal run and worker views
- public release-centric report pages on the apex site

What is still thin is the product layer above those records. Today the system is stronger at "one run happened" than at "this benchmark version, campaign, release, and comparison are durable objects with clear ownership."

## Decision

ParetoProof should add a small set of persistent product objects above the execution kernel:

1. model registry entry
2. launch template
3. evaluation campaign
4. benchmark version
5. benchmark release
6. comparison group
7. frontier report

These objects do not replace runs. They organize, constrain, and publish runs.

The run, job, attempt, and artifact kernel remains the source of truth for execution evidence. Product objects sit above that kernel to answer:

- what was supposed to be evaluated
- under which reproducibility boundary
- what has been approved for release
- which comparisons are valid to publish

## Object model

### 1. Model registry entry

Purpose:

- durable catalog entry for one launchable model configuration
- separates a human-operable benchmark product from raw `modelConfigId` strings alone

Canonical fields:

- `modelRegistryId`
- `modelConfigId`
- provider family
- auth-mode support boundary
- model snapshot or version policy
- default tool profile and run-mode posture
- lifecycle state such as active, deprecated, or withheld

Why it exists:

- launch templates and campaigns should reference a curated model object, not arbitrary free-form model ids
- public release pages should describe tested model entries, not whatever string happened to land on a run

Ownership:

- portal-admin managed
- execution kernel still stores the exact resolved `modelConfigId` and snapshot used on each run

### 2. Launch template

Purpose:

- reusable launch recipe for a narrow benchmark-evaluation shape

Canonical fields:

- `launchTemplateId`
- target benchmark version
- target model registry entry or allowed model set
- allowed run kinds
- governance caps or template-level overrides
- launch parameter schema for the browser
- visibility and owner scope

Why it exists:

- the launch UI should not reconstruct a valid evaluation recipe from disconnected dropdowns forever
- repeated operational launches need a durable, reviewable template boundary

Ownership:

- portal-admin managed
- collaborator launch uses a template-backed mutation rather than creating a brand-new product definition each time

### 3. Evaluation campaign

Purpose:

- groups a coordinated set of launches under one evaluation objective

Canonical fields:

- `campaignId`
- benchmark version
- included launch templates
- included model registry entries
- campaign status such as draft, active, closed, or superseded
- intended comparison policy
- release target or destination

Why it exists:

- public comparisons should usually refer to campaign-shaped cohorts, not arbitrary cross-run selections
- a campaign is the durable answer to "which runs belong together for this evaluation wave?"

Ownership:

- portal-admin managed
- runs link upward to the campaign they were created under when applicable

### 4. Benchmark version

Purpose:

- durable product object for one released or releaseable benchmark package/version slice

Canonical fields:

- `benchmarkVersionId`
- benchmark package id and version
- benchmark package digest
- benchmark scope label
- benchmark item set definition
- release posture such as internal, draft-public, released, or withdrawn
- linked source and benchmark-owned artifacts

Why it exists:

- the portal and public site already use `benchmarkVersionId`, but the system still needs a first-class object behind that id
- releases, campaigns, and comparison groups should reference a benchmark version object, not infer one from run rows

Ownership split:

- repository-owned for canonical benchmark package contents and package digests
- portal-admin managed for release posture, display metadata, and product-level notes

### 5. Benchmark release

Purpose:

- explicit publication record for what evidence, metrics, and narrative are approved to appear on the public site

Canonical fields:

- `benchmarkReleaseId`
- source benchmark version
- included model registry entries or comparison groups
- included artifacts and reports
- release label and status
- approval metadata
- publication timestamp

Why it exists:

- public reporting must be release-centric, not "whatever runs currently exist"
- release approval is a separate product decision from campaign execution or artifact availability

Ownership:

- portal-admin managed
- consumes kernel evidence and benchmark-owned artifacts but does not redefine them

### 6. Comparison group

Purpose:

- durable grouping of results that are allowed to be compared like-for-like

Canonical fields:

- `comparisonGroupId`
- source campaign or explicit inclusion list
- benchmark version
- allowed model registry entries
- comparison contract digest or identity tuple
- aggregation policy
- status such as draft, valid, invalidated, or published

Why it exists:

- valid comparisons need a persisted object that says which runs belong together and why
- this prevents later dashboards from comparing incomparable runs simply because they share a superficial benchmark label

Ownership:

- portal-admin managed or system-derived from campaign completion
- must carry the reproducibility boundary, not merely point at run ids

### 7. Frontier report

Purpose:

- durable public-facing summary object built from one or more valid comparison groups

Canonical fields:

- `frontierReportId`
- included comparison groups
- included benchmark releases
- methodology note
- publication status
- top-line metric set
- linked public report artifacts

Why it exists:

- the public site should publish stable report objects, not compute "frontier" views live from raw private runs
- frontier reporting needs its own approval and revision history

Ownership:

- portal-admin managed for approval
- public site reads only released frontier reports and release summaries

## Reproducibility attachment

Every product object above runs should attach to the reproducibility boundary at the right layer.

### Model registry entry

Must declare:

- supported provider family
- supported auth modes
- snapshot or versioning policy

But it does not replace the per-run resolved model snapshot.

### Launch template and campaign

Must carry:

- benchmark version reference
- model registry reference
- governance policy version
- allowed run kinds and targeting rules

These objects define the intended evaluation envelope.

### Benchmark version

Must anchor:

- benchmark package digest
- benchmark item set definition
- benchmark-owned source artifacts

This is the stable product-layer identity for the benchmark slice itself.

### Benchmark release, comparison group, and frontier report

Must consume only evidence that already satisfies:

- the artifact and release policy baseline
- the comparison-validity boundary
- the benchmark version and model registry identities attached to the underlying runs

Public objects must never outrun the provenance guarantees of the underlying kernel.

## Ownership split

### Repository-owned truth

The repository remains the owner of:

- benchmark package contents and digests
- worker and verifier contracts
- reproducibility-critical schemas and evidence rules
- benchmark-owned source artifacts

These are versioned in code and artifacts, not curated ad hoc in the portal.

### Portal-admin managed truth

The portal becomes the owner of:

- model registry curation and active/inactive posture
- launch templates
- evaluation campaigns
- benchmark release approval
- comparison-group approval
- frontier-report approval and publication notes

This is the human-operable product layer.

## API and UI boundaries

### Portal

The portal should own:

- model registry management
- launch-template management
- campaign creation and monitoring
- release approval workflows
- comparison-group inspection and approval
- frontier-report drafting and approval

The portal should not be forced to derive these objects from raw run queries alone.

### Public site

The public site should read only:

- released benchmark releases
- released frontier reports
- public benchmark metadata

It should not query draft campaigns or private comparison groups directly.

### Worker and internal execution surfaces

Workers remain downstream of product objects.

They receive:

- resolved benchmark version identity
- resolved model configuration
- run-level execution targets

They do not own campaigns, releases, or comparison logic.

## MVP-adjacent vs later

### MVP-adjacent

These objects should be treated as the next product layer to implement:

- benchmark version
- model registry entry
- launch template
- benchmark release

Reason:

- the existing portal launch and public release surfaces already imply these objects
- without them, the current UI keeps encoding product meaning in raw ids and hardcoded data

### Near-later but important

- evaluation campaign
- comparison group

Reason:

- they are needed before serious multi-model evaluation and comparability work becomes safe
- but the system can still stand up a smaller first release flow before full campaign management exists

### Explicitly later

- frontier report as a richer multi-group public reporting object

Reason:

- public release pages can exist before a full frontier-report product is implemented
- frontier reports should consume stable releases and comparison groups, not come first

## Route and storage implications

This scope does not lock exact route names, but it does lock ownership:

- model registry, launch templates, campaigns, and release approvals are portal-admin or operator-owned control-plane objects
- browser launch still creates runs through the portal launch contract instead of creating campaigns inline
- benchmark releases and frontier reports are persistent DB-backed objects with linked artifacts, not just static page content

Expected storage relationship:

- product objects live in Postgres
- public or reproducibility-facing bundles and reports live as artifacts linked to those objects
- runs, jobs, attempts, and artifacts continue to hold the execution evidence underneath

## Explicit out-of-scope decisions

This scope does not:

- implement the objects
- decide the canonical benchmark target beyond current benchmark scopes
- define the full post-kernel intake and curation-review workflow
- define delegated admin-review moderation
- replace the existing launch mutation baseline

## Follow-up execution slices

Execution work after this scope should split into:

1. model registry and benchmark-version persistence plus portal admin read/write surfaces
2. launch-template persistence and launch resolution against those templates
3. benchmark-release objects and public release-page data sourcing
4. campaign and comparison-group objects with validity-aware aggregation
5. frontier-report objects once released comparisons are stable enough to publish
