# Public Disclosure and Hold-Out Policy Baseline

This document defines how ParetoProof separates public benchmark material from private hold-out material, when a private hold-out set may exist, and what discussion constraints apply during curation and evaluation.

The goal is to stop disclosure policy from being inferred piecemeal from statement metadata, artifact visibility, or reviewer habit. Benchmark material needs one explicit rule for what may be public, what may remain private, and what kinds of benchmark claims are allowed in each case.

## Core policy

ParetoProof MVP may maintain both:

- a public benchmark set whose released materials may support public benchmark claims
- a private hold-out set used for internal calibration, evaluation, or future release preparation

The strict boundary is:

- public benchmark claims must be based only on benchmark items whose released materials are actually public
- private hold-out results may inform internal decisions, but they must not be presented as externally reproducible public benchmark numbers while the underlying benchmark material remains undisclosed

This keeps ParetoProof from claiming transparent evaluation while withholding the objects needed to inspect what was evaluated.

## Visibility tiers for benchmark material

For benchmark-item disclosure, ParetoProof MVP should use three practical visibility tiers.

### `public_release`

Material in this tier may be discussed publicly and may support public benchmark claims.

Typical public-release benchmark material includes:

- the released informal problem statement
- the released canonical formal statement
- released benchmark-package or benchmark-source artifacts
- released benchmark reports and released result summaries

### `approved_contributor`

Material in this tier may be shared with trusted contributors but is not open-web public.

Typical contributor-restricted material includes:

- contributor review packets
- selected unreleased benchmark-source material
- review-safe notes for active curation

This tier supports collaboration without collapsing every active curation item into immediate public release.

### `private_internal`

Material in this tier is restricted to internal curators, admins, or equivalent maintainers.

Typical private-internal material includes:

- hold-out benchmark statements
- unreleased canonical formal targets
- internal gold or reference solutions for hold-out items
- contamination review notes and curation judgments that would leak the hold-out
- internal results computed on hold-out items

## Public versus private benchmark material

### Public benchmark material

A benchmark item counts as public benchmark material only when the released benchmark-facing objects for that item are intentionally disclosed.

At minimum, that means:

- the benchmark's informal or formal target is publicly available in the release form ParetoProof is evaluating
- the benchmark can identify the released version being evaluated
- the benchmark can distinguish public released results from any still-private curation state

Public benchmark material may support:

- public benchmark reports
- public comparisons
- public discussions of task content, theorem targets, and released benchmark design

### Private hold-out material

A benchmark item counts as private hold-out material when any benchmark-defining content remains undisclosed, such as:

- the full informal statement
- the canonical formal statement
- the benchmark-owned reference artifact
- enough curation detail to reconstruct the item

Private hold-out material may still be used internally for:

- calibration
- regression checks
- curation triage
- future release preparation

But private hold-out material may not support public claims that pretend the benchmark is already fully inspectable or reproducible from public artifacts.

## Hold-out policy

ParetoProof MVP should support a private hold-out set, but it should keep the policy conservative.

The minimum hold-out rules are:

- hold-out items must still satisfy the same internal curation and reference-solution standards as public items
- hold-out status is a disclosure decision, not an excuse for weak provenance or missing reference artifacts
- internal hold-out results may be used for internal benchmarking, but they must be labeled as internal-only
- public summaries may mention that an internal hold-out program exists, but they must not reveal enough detail to reconstruct unreleased items
- once a hold-out item is released publicly, public reporting should refer to the released benchmark version rather than to a previously opaque internal description

The MVP does not need a large hold-out program on day one, but it should preserve the option and the policy boundary now.

## Public reporting rules

Public reporting must distinguish between:

- results on public released benchmark items
- internal-only results on private hold-out items

Allowed public statements include:

- publishing numbers computed only on public released items
- describing that internal hold-out evaluation exists without presenting it as a public benchmark leaderboard
- publishing clearly labeled internal research notes later if the benchmark text makes the private status explicit

Not allowed:

- mixing private hold-out results into a public benchmark aggregate without clear separation
- calling a result externally reproducible when the relevant benchmark material is still private
- discussing private hold-out performance in a way that leaks statement content, solution structure, or evaluation-specific hints

## Discussion and curation constraints

Disclosure rules apply not only to release artifacts, but also to how the team talks about benchmark items while they are being curated.

For `private_internal` hold-out items:

- do not post full statement text, exact theorem targets, or gold-proof structure in public issues, PRs, public chats, or public release notes
- do not publish near-verbatim paraphrases that would effectively reveal the item
- do not discuss distinctive hints, key constructions, or contamination findings in public threads when those details would deanonymize the item

For `approved_contributor` material:

- keep discussion inside contributor-restricted or equivalent trusted surfaces
- do not assume contributor-visible material is automatically safe for public reposting

For `public_release` material:

- the statement and released benchmark design may be discussed publicly
- public discussion should still distinguish released benchmark facts from private internal notes that remain undisclosed

## Relationship to artifact and metadata policy

Disclosure state is not the same thing as curation lifecycle state.

Important boundaries:

- `statementStatus` tracks curation lifecycle, not disclosure
- artifact visibility controls download access, but benchmark disclosure policy decides what kinds of benchmark claims those artifacts may support
- a hold-out item may be fully curated and internally active while still remaining `private_internal`

This means a benchmark item can be:

- internally valid
- internally benchmarked
- not yet publicly discussable as a released benchmark item

All three states must be tracked without collapsing them into one boolean.

## MVP application to `firstproof/Problem9`

For the current offline `firstproof/Problem9` slice:

- the benchmark package is repository-visible
- the statement and formal target are public
- the gold artifact is public
- the item may support public benchmark discussion and public released benchmark claims

Problem 9 is therefore a `public_release` benchmark item, not a hold-out item.

## Relationship to adjacent baselines

- `problem-statement-metadata-baseline.md` defines the statement metadata and lifecycle fields that disclosure policy must not overload
- `gold-reference-solution-policy-baseline.md` defines what internal reference artifacts must exist even when they are withheld
- `source-problem-selection-baseline.md` defines source exposure and contamination labeling before disclosure decisions are applied
- `benchmark-curation-criteria-baseline.md` defines quality and novelty checks for keeping an item active
- `artifact-retention-access-baseline.md` defines the artifact visibility and retention model that supports the disclosure boundary operationally

This document is the source of truth for what may be public, what may remain private, and which benchmark claims are allowed for each case.

## Out of scope

- exact portal UX for contributor-restricted benchmark browsing
- legal or contractual disclosure obligations outside the repository policy baseline
- long-term anonymization or staged-release strategy beyond the MVP boundary
