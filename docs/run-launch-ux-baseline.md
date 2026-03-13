# Run Launch UX Baseline

This document defines the MVP portal UX for launching and supervising larger evaluation runs.

## Goal

Contributors and admins must be able to create reproducible evaluation launches with explicit model/benchmark settings, validate constraints before submit, and track launch readiness without dropping into ad hoc scripts.

## Launch surfaces

MVP uses a three-surface launch flow inside the authenticated portal:

1. Run launch workspace
2. Launch review and validation gate
3. Batch monitoring view

### 1) Run launch workspace

The launch workspace captures all run inputs before submission.

Required input groups:

- benchmark selection (name + pinned version)
- problem set mode (`all`, `tag-filtered`, `explicit-list`)
- model configuration profile (provider + model + prompt protocol id)
- runner target (`modal-default`, `modal-high-mem`)
- budget guardrails (max attempts, max wall time, token budget cap)
- artifact policy profile (standard, debug-verbose)
- concurrency profile (serial, bounded-parallel)

Optional input groups:

- per-problem model override map
- run label and notes
- scheduled start time (future launch)

Every changed field must update a deterministic launch preview identifier so users can confirm they are launching the intended configuration.

### 2) Launch review and validation gate

Before submit, the portal must run a preflight checklist and show pass/fail for each gate.

Required preflight checks:

- requestor has launch permission for selected benchmark/project
- benchmark version is resolvable and not retired
- model profile is allowed in the selected environment
- budget/concurrency settings are within policy limits
- runner target has at least one available worker lane
- required secrets and artifact destination are configured

When checks fail, submit remains disabled and the blocking checks are displayed with actionable reason codes.

### 3) Batch monitoring view

After submit, users land on a batch-centric monitor for the launched evaluation.

Required batch actions:

- cancel queued launch
- pause additional claims for a running batch
- resume a paused batch
- request controlled retry for failed problems only
- export batch manifest and problem-level status snapshot

Actions must enforce role boundaries:

- contributors: launch, view, pause/resume own batches, request retry
- admins: all contributor actions plus cancel any batch and override policy-limited retries

## Model-per-problem support

MVP must support model-per-problem selection without requiring a custom file format.

Baseline behavior:

- default model applies to all selected problems
- optional override table allows problem id -> model profile mapping
- overrides are validated against the same allowlist as the default model
- launch review summarizes override count and lists invalid mappings

Out of scope for MVP:

- conditional override expressions (for example by theorem tags + solver class)
- multi-stage auto-routing policies driven by prior pass/fail outcomes

## State and routing

Launch state must be deep-linkable and recoverable on refresh.

- encode draft launch id and active step in query parameters
- persist unsent draft inputs server-side for authenticated user/session
- preserve draft for at least 24 hours unless explicitly discarded
- include batch id in URL after submit so monitoring view is shareable

## Empty, loading, and error states

The launch UX must include first-class fallback states:

- empty state when no benchmark versions are available
- loading skeletons for benchmark/model policy fetches
- inline validation state for preflight checks in progress
- recoverable error state for submit failures with retry action and support context id

## Out of scope

- visual drag-and-drop launch builders
- cross-project batch orchestration from one launch surface
- automatic retry scheduling based on budget leftovers
- anonymous/public launch workflows outside authenticated portal access