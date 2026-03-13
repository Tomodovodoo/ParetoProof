# Benchmark Curation Criteria Baseline

This document defines the minimum curation criteria a candidate math problem must satisfy before ParetoProof should keep it as an active benchmark item.

The goal is to separate two questions that often get blurred together:

- source selection: where the item came from
- curation: whether the item is actually good enough for benchmark use

An item may come from an allowed source family and still be a poor benchmark target. This document fixes the acceptance criteria around difficulty, novelty, contamination, theorem quality, and Lean suitability.

## Core curation rule

ParetoProof should keep a candidate benchmark item only if all of the following are true:

- the item has a traceable source and provenance record
- the item has a clear mathematical target worth benchmarking
- the item can be represented faithfully in the supported Lean lanes
- the item's contamination and novelty posture is labeled honestly
- the item has a difficulty label that is coarse but defensible

If any one of those fails, the item should remain draft, be reworked, or be rejected.

## Difficulty standard

ParetoProof MVP uses the coarse `difficulty` tiers already defined in `problem-statement-metadata-baseline.md`:

- `introductory`
- `standard`
- `challenging`
- `research_like`

These tiers are curation labels, not psychometric claims. They should be assigned by looking at the combined burden of:

- understanding the mathematical statement
- identifying a viable proof or construction strategy
- expressing the target faithfully in Lean
- completing or checking the proof in the selected benchmark setting

The difficulty label must not be based only on proof length, theorem fame, or whether a human happens to already know the trick.

### Difficulty assignment rules

- `introductory`: suitable for a well-prepared learner or contributor once the relevant definitions are in view; little hidden setup or theorem-search burden
- `standard`: requires nontrivial reasoning or a small technique combination, but remains well within ordinary benchmark expectations
- `challenging`: requires a meaningful proof idea, careful formalization decisions, or several dependent lemmas
- `research_like`: likely requires substantial problem solving, subtle formulation work, or proof search beyond normal benchmark exercises

When an item's human-math difficulty and formalization difficulty diverge, ParetoProof should label difficulty by the actual benchmark task being asked. A theorem that is easy on paper but awkward to state cleanly in Lean may deserve a higher curation difficulty tier for a formalization benchmark than for informal reasoning.

## Novelty standard

ParetoProof must use "novelty" narrowly and honestly.

For MVP, novelty means how strong a claim the benchmark can make about prior exposure of the formal target or reference solution, not whether the problem feels fresh to a reviewer.

The minimum novelty standard is:

- the benchmark must not imply unseen or hold-out novelty unless the source and contamination record support that claim
- already formalized items are acceptable, but they must not be marketed as novel formalization targets
- benchmark-owned normalization of an old theorem does not make the underlying mathematics new

The practical curation question is:

- can this item support a novelty-sensitive benchmark claim, or is it better treated as a regression, comparison, or controlled benchmark item?

If the answer is unclear, ParetoProof should choose the more conservative interpretation.

## Required contamination checks

Every candidate benchmark item should undergo at least these contamination checks during curation:

- check whether the source statement is already formalized in the target theorem-proving ecosystem
- check whether an official or widely circulated formal solution is already available
- check whether the exact or near-exact informal statement is a common benchmark or training-style item in public archives
- check whether ParetoProof is importing an upstream formal artifact, proof sketch, or editorial normalization that changes what novelty claims are still credible

The purpose of these checks is not to ban all contaminated items. The purpose is to prevent unsupported claims about clean evaluation, unseen statements, or first-time formalization.

## Theorem quality criteria

A candidate benchmark item should only be kept if the theorem or problem target has acceptable mathematical quality.

The minimum theorem-quality criteria are:

- the statement has one clear intended meaning
- the statement is neither vacuous nor accidentally trivial after formalization
- the theorem does not depend on hidden context that the benchmark cannot package explicitly
- the target is substantive enough that success means something beyond formatting or namespace bookkeeping
- the target is stable under benchmark-owned normalization; if small wording changes produce materially different tasks, the benchmark must choose one canonical version and version it carefully

Items should usually be rejected or reworked when they are:

- ambiguous about assumptions, domains, or notation
- mostly clerical translation with no substantive mathematical target
- dependent on large undeclared background context that the benchmark cannot ship cleanly
- mathematically distorted by the formalization needed to make them work

## Lean suitability criteria

Even a mathematically interesting problem may be a poor ParetoProof benchmark item if it does not fit the Lean-based evaluation boundary.

The minimum Lean suitability criteria are:

- the item can be expressed faithfully in the supported Lean lane without unsupported external systems
- the statement can live inside a bounded benchmark package with explicit imports, helper definitions, and versioned dependencies
- the target does not require opaque handwritten preprocessing, image interpretation, or unstated domain translation to become formal
- the proof or formal target can be checked within the benchmark's reproducible execution model
- any supporting formal context needed for the item can be owned and versioned by the benchmark package

Examples of poor Lean suitability for MVP include:

- problems that fundamentally require external diagrams as the only authoritative object
- statements whose intended meaning depends on unstated notation conventions that cannot be stabilized in the package
- items that need large bespoke infrastructure far beyond the benchmark slice just to state the target sensibly

## Acceptance rubric

Each candidate item should be reviewed against this minimum rubric:

- source provenance: is the origin traceable and correctly labeled?
- difficulty: is the assigned difficulty tier coarse but defensible for the actual benchmark task?
- novelty posture: does the benchmark avoid stronger novelty claims than the contamination record supports?
- contamination checks: were prior formalizations, widely circulated solutions, and upstream artifacts checked and recorded?
- theorem quality: is the target mathematically clear, substantive, and non-accidental?
- Lean suitability: can the item be expressed and checked cleanly inside the supported Lean benchmark boundary?

An item that fails any one of these should not become `active` until the problem is fixed or the benchmark claim is narrowed.

## MVP application to `firstproof/Problem9`

For the current `firstproof/Problem9` slice:

- difficulty is closer to `introductory` or low `standard` because the target theorem is intentionally small
- novelty is benchmark-owned rather than a hold-out claim about historical source material
- contamination concerns are acceptable because the slice is currently establishing the benchmark kernel, not claiming unseen-source difficulty
- theorem quality is acceptable because the target is precise, non-ambiguous, and paired with benchmark-owned support context
- Lean suitability is strong because the statement, support module, and gold proof all fit inside one pinned, reproducible package

That makes Problem 9 a valid MVP kernel item even though it is not intended to be the final difficulty bar for broader ParetoProof benchmarking.

## Relationship to adjacent baselines

- `source-problem-selection-baseline.md` defines which source families may enter the curation funnel
- `problem-statement-metadata-baseline.md` defines the metadata fields that must record source and difficulty labels
- `gold-reference-solution-policy-baseline.md` defines the reference-solution requirement once an item is active
- `lean-formalization-standards-baseline.md` defines how benchmark-owned Lean targets and gold proofs should be authored
- issue `#77` should later define how public disclosure and hold-out policy affect what can be claimed publicly about curated items

This document is the source of truth for deciding whether a selected candidate item is good enough to remain in the ParetoProof benchmark set.

## Out of scope

- exact database or UI fields for recording every curation note
- contributor workflow automation for curation review
- final public benchmark release policy
- scoring formulas or leaderboard presentation
