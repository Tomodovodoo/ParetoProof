# Prompt and Run Protocol Baseline

This document defines the MVP prompt and run protocol for ParetoProof worker executions. It separates stable harness instructions from benchmark content, lists the context a run must carry, and fixes the default tool-permission model for Lean-oriented runs.

## Prompt layer separation

Each attempt should be built from four distinct layers:

- `system` layer: repo-owned invariant instructions covering role, output discipline, tool rules, refusal boundaries, and reproducibility requirements
- `benchmark` layer: benchmark-wide framing such as task family, normalization rules, and any benchmark-specific answer-format expectations
- `item` layer: the exact theorem or problem payload, local mathematical context, and any item-scoped guidance that is necessary to attempt the task
- `run envelope` layer: non-secret execution metadata such as run kind, attempt id, timeout, token budget, tool profile, harness version, and pinned environment identifiers

The critical rule is that benchmark content must not be embedded into the system prompt. The system layer is versioned with the harness, while benchmark and item layers are versioned with the benchmark dataset. That separation keeps prompt changes auditable and allows reruns without silently changing the task statement.

## Required context package

Every worker assignment must carry enough context to rerun the attempt deterministically:

- identity metadata: `runId`, `jobId`, `attemptId`, `benchmarkVersionId`, `benchmarkItemId`, and `modelConfigId`
- environment metadata: harness revision, prompt template version, Lean toolchain version, Mathlib or repository revision, and run kind
- math payload: theorem statement or target task, expected module or file context, imports, namespaces, assumptions, and any allowed supporting definitions
- execution budget: timeout ceiling, turn ceiling for agentic runs, token budget, artifact size expectations, and cancellation or heartbeat timing inherited from the control-plane contract
- tool policy: explicit permission profile, network policy, writable-path policy, and whether Lean-MCP is expected to be available
- output contract: expected terminal artifact shape, required structured summary fields, and the validation command or authority that decides success

Only the subset that is useful to the model should be exposed to the model prompt. Control-plane bookkeeping stays in the run envelope even when it is not shown verbatim to the model.

## Prompt content rules

The prompt protocol should follow a narrow content contract:

- the `system` layer may describe allowed tools, output format, and non-negotiable constraints, but it may not contain benchmark answers, hidden evaluator labels, or run-specific secrets
- the `benchmark` layer may define common task framing for a benchmark family, but it must stay generic across all items in that benchmark version
- the `item` layer is the only place where the exact theorem statement, proof target, or item-local examples belong
- retries and `pass@k` attempts must reuse the same benchmark and item payload unless the benchmark definition itself changes version
- prompt templates must be stored in the repository and identified by version in result metadata so later evaluation can attribute behavior to a concrete prompt contract

## Tool permission profiles

MVP runs should use explicit permission profiles rather than ad hoc tool grants:

- `no_tools`: plain model completion with no external tools or file mutation
- `lean_mcp_readonly`: Lean-MCP access for proof-state inspection, diagnostics, symbol lookup, and other read-oriented assistance against the pinned local checkout
- `workspace_edit_limited`: controlled read and write access inside the assignment sandbox plus pinned local harness commands needed to produce candidate Lean files or patches

Network access is off by default for all three profiles. External web browsing, package installation, arbitrary shell access outside the assignment sandbox, and access to host-level secret locations are not part of the MVP protocol. If a future benchmark needs a broader tool profile, that should be introduced as a new named profile rather than as an implicit exception.

## Lean-MCP usage policy

Lean-MCP is the default interactive tool path for Lean-focused runs, but it is not the final authority on correctness.

- Lean-MCP sessions must point at the exact pinned Lean and Mathlib environment declared in the run envelope
- Lean-MCP may be used for goal inspection, diagnostics, symbol lookup, and local proof-state exploration
- Lean-MCP must not be used as permission to mutate the benchmark checkout outside the run sandbox or to fetch unpinned dependencies from the network
- a run may record Lean-MCP transcripts and diagnostics as artifacts, but final success still requires authoritative Lean validation in the worker environment
- if Lean-MCP is required by the selected tool profile but unavailable, the attempt should fail as a tooling or harness problem rather than silently broadening permissions

## Attempt output contract

Each attempt must end with both structured metadata and reproducible artifacts:

- structured terminal record: prompt protocol version, tool profile, stop reason, model summary, and validation outcome
- reproducible artifacts: normalized prompt package, model transcript, any generated Lean source or patch, tool logs, and validation outputs

This contract lets downstream result views, failure registration, and artifact-catalog issues build on one stable attempt boundary instead of inferring protocol details from raw logs.

## Operational rules

- one attempt corresponds to one immutable prompt package
- provider changes or prompt-template changes require a new attempt, not mutation of an in-flight assignment
- local Docker and Modal workers must consume the same logical prompt package even if the runtime wrapper differs
- model-provider-specific prompt optimizations may exist later, but the benchmark and result schema must still map back to the shared protocol layers above

## Out of scope

- provider-specific wording optimizations for individual model vendors
- retry and scheduler policy, which is covered by `docs/run-control-governance-baseline.md`
- final failure taxonomy, which belongs to issue `#48`
- implementation of the worker harness itself
