# Model Configuration Registry Baseline

This document defines the MVP model configuration registry for the offline `firstproof/Problem9` slice. The registry is the repository-owned source of truth for which model variants are allowed to run, how those variants are pinned across time, and which limits are fixed centrally versus selected per run.

The goal is to keep provider execution reproducible and reviewable. ParetoProof should not accept ad hoc model strings and hidden vendor defaults if later comparisons need to explain why one run behaved differently from another.

## Registry role

The model configuration registry owns:

- stable `modelConfigId` values used by runs, artifacts, and result views
- the mapping from `modelConfigId` to provider family, upstream model identifier, and auth-mode constraints
- snapshot and date tracking for providers whose public model names are not enough for reproducibility
- default and maximum token, spend, and wall-clock-related provider settings that apply before run-level budgets are layered on
- reasoning-mode and sampling-mode settings that materially change execution behavior
- tool and attachment capability declarations needed by the harness

The registry does not own:

- prompt package contents
- per-attempt stop conditions from issue `#145`
- failure taxonomy from issue `#48`
- provider transport implementation details from `provider-framework-api-baseline.md`

## Core principles

The registry follows five hard rules:

- every benchmarked run references one checked-in `modelConfigId`, not a free-form vendor model string
- a model configuration may pin a vendor snapshot or release date, but it may not float to "latest" at execution time
- central defaults must be strict enough that runs stay comparable even when a caller forgets to pass an override
- run-level overrides are allowed only for fields explicitly marked overrideable in this document
- changes that materially alter generation behavior require a new `modelConfigId`, not silent mutation

## Canonical registry object

Each registry entry must provide these required fields:

- `modelConfigId`
  - repository-owned stable identifier such as `openai.gpt-5-codex.high_reasoning.v2026-03-13`
- `providerFamily`
  - one of the normalized provider families from `provider-framework-api-baseline.md`
- `upstreamModelId`
  - the provider-native model name used on the wire
- `authModes`
  - the allowed auth modes for this configuration
- `snapshotPolicy`
  - exact pin metadata described below
- `capabilities`
  - tool mode, attachment mode, structured-output support, and reasoning-setting support
- `defaults`
  - the central default values for output, context, reasoning, and sampling controls
- `limits`
  - the absolute maximum values a run may request through this configuration
- `pricing`
  - the cost table or price reference version used for spend accounting
- `status`
  - `active`, `deprecated`, `disabled`, or `experiment`

The canonical object may include descriptive metadata such as display name, owner notes, or deprecation reason, but those fields are never authoritative for execution.

## Model identity and snapshot tracking

Provider model names alone are not enough for reproducibility. The registry must record the exact identity evidence needed for later comparison.

Each entry's `snapshotPolicy` must include:

- `pinKind`
  - `exact_snapshot`, `dated_alias`, or `provider_fixed_release`
- `snapshotLabel`
  - the provider's explicit snapshot name when available
- `releaseDate`
  - ISO date for the underlying model snapshot or published release
- `providerRevision`
  - optional provider-specific revision token or response metadata key when the vendor exposes one
- `registryVersion`
  - the repository-side version stamp for the entry itself

The allowed pin kinds work like this:

- `exact_snapshot`
  - use when the provider exposes an immutable snapshot id; this is the preferred mode for benchmark-authoritative runs
- `dated_alias`
  - use only when the provider exposes a dated alias that is stable enough for MVP comparison work
- `provider_fixed_release`
  - use when the provider version is inherently release-based and does not offer a separate snapshot token

Bare rolling aliases such as `latest`, `default`, or "current production model" are invalid for benchmarkable ParetoProof runs.

## Required capability fields

Each configuration must declare the execution capabilities that the harness relies on:

- `toolCallModes`
  - subset of `none`, `provider_native`, or `harness_only`
- `attachmentModes`
  - supported attachment/input classes, initially `none` for the Problem 9 MVP
- `supportsStructuredOutput`
- `supportsReasoningMode`
- `supportsTemperature`
- `supportsTopP`
- `supportsSeed`
- `supportsResponsePrefill`

These capability flags prevent the harness from guessing which provider knobs are meaningful for a given model family.

## Reasoning and sampling policy

Reasoning and sampling settings must be explicit because they materially change the benchmark contract.

Every entry must declare:

- `reasoningMode`
  - one of `minimal`, `standard`, `high`, or `provider_defined`
- `reasoningBudget`
  - provider-specific reasoning effort token or effort tier when applicable
- `temperature`
- `topP`
- `maxOutputTokens`
- `maxContextTokens` or `maxContextBytes`

For the Problem 9 MVP:

- benchmark-authoritative configurations should prefer deterministic or low-variance sampling defaults
- reasoning mode should be fixed in the registry rather than chosen ad hoc per run
- any provider that only offers coarse reasoning tiers must map them into the normalized `reasoningMode` field plus provider-specific metadata in the escape-hatch section already defined by the provider API baseline

If changing `reasoningMode`, `reasoningBudget`, or the default sampling profile would plausibly change pass/fail behavior, that change requires a new `modelConfigId`.

## Central defaults versus run-level overrides

The registry must separate centrally fixed settings from narrow run-level choices.

### Centrally fixed fields

These fields are fixed by the registry entry and may not be overridden by a run:

- `providerFamily`
- `upstreamModelId`
- `authModes`
- `snapshotPolicy`
- `toolCallModes`
- default reasoning mode family
- default safety or refusal mode when the provider exposes it
- pricing reference version

Changing any of those creates a new model configuration identity.

### Narrow run-level overrides

These fields may be lowered or tightened per run when the harness allows it:

- `maxOutputTokens`
- `timeoutMs`
- spend ceiling inherited from issue `#145`
- whether tools are enabled, but only within the declared `toolCallModes`

These fields may not be increased above the registry `limits` values.

### Disallowed run-level overrides

Runs must not override:

- reasoning mode tier
- provider snapshot
- auth mode outside the declared allowed set
- temperature or top-p for benchmark-authoritative lanes

The MVP rule is intentionally conservative: comparability matters more than per-run tuning flexibility.

## Token and spend limits

The registry must expose two separate layers of limits.

### Default operating values

`defaults` records the values the harness uses when a run does not ask for anything narrower:

- default `maxOutputTokens`
- default request timeout
- default context limit
- default reasoning effort
- default tool-call ceiling if tools are enabled

### Absolute ceilings

`limits` records the highest values this configuration may ever request:

- hard `maxOutputTokens`
- hard request timeout
- hard context bound
- hard per-attempt spend cap contribution
- optional hard tool-call ceiling

Issue `#145` still defines the run-level harness budgets and stop conditions. This registry only fixes the model-side envelope that those budgets must fit inside.

## Auth-mode boundary

One model configuration may support more than one auth mode only when the benchmark semantics stay equivalent enough to compare.

For MVP:

- `trusted_local_user` and `machine_api_key` may both be allowed for an OpenAI-family configuration only if they target the same pinned upstream snapshot and the same normalized defaults
- if the local trusted path applies hidden vendor defaults that the machine path cannot match, those must be separate registry entries
- local stub models always require separate `modelConfigId` values and can never masquerade as authoritative benchmark entries

This avoids collapsing exploratory local runs and canonical non-interactive benchmark runs into one ambiguous identifier.

## Status lifecycle

Each entry must carry one of four lifecycle states:

- `active`
  - allowed for benchmark-authoritative and exploratory runs
- `experiment`
  - allowed only for explicitly marked experiment lanes or local exploratory runs
- `deprecated`
  - kept for historical reruns and result interpretation, but not the default for new authoritative runs
- `disabled`
  - blocked from new runs but retained for audit history

Historical result views must keep resolving old `modelConfigId` values even after deprecation or disablement.

## Run record and artifact requirements

Every run bundle and downstream result record that references a model configuration must preserve enough evidence to reconstruct the exact execution contract:

- `modelConfigId`
- `providerFamily`
- `authMode`
- `upstreamModelId`
- `snapshotPolicy` summary
- normalized reasoning mode
- normalized output/context ceilings actually in force for the attempt
- pricing reference version or cost table version

The harness may duplicate this information from the registry into `run-bundle.json` for portability, but the registry entry remains the canonical definition.

## Change policy

The following changes require a new `modelConfigId`:

- changing the upstream model id
- changing the pinned snapshot or release date
- changing the auth-mode set
- changing default reasoning mode or reasoning budget
- changing the benchmark-authoritative sampling profile
- changing hard limits in a way that could alter run outcomes

The following changes may update the same registry entry revision without minting a new identity:

- clarifying descriptive notes
- adding non-authoritative display metadata
- adding a provider revision field that only improves observability without changing the actual pinned snapshot

## Relationship to adjacent baselines

- `provider-framework-api-baseline.md` defines the provider-family, auth-mode, and request/response boundary that each registry entry must fit.
- `prompt-run-protocol-baseline.md` defines how `modelConfigId` is carried into each prompt package and run envelope.
- `problem9-agent-loop-baseline.md` defines the attempt boundary and makes clear that changing `modelConfigId` creates a new attempt.
- issue `#145` will define the outer harness budgets that sit on top of the model-side defaults and limits described here.
- issue `#48` should reuse these normalized fields when it classifies provider and model-level failures.

## Out of scope

- the final public failure taxonomy
- provider adapter implementation code
- benchmark-wide reporting metrics
- secrets management for provider credentials
