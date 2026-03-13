# Source Problem Selection Baseline

This document defines which source families ParetoProof may use when selecting benchmark problems, how those source families should be labeled, and which contamination and provenance constraints apply before an item enters benchmark curation.

The goal is to keep benchmark intake anchored to explicit, reviewable source categories instead of a vague mix of contests, textbooks, theorem libraries, and ad hoc copied statements. Later curation work can decide which items are good enough, but source selection must first define what kind of upstream material is even eligible to enter the funnel.

## Core selection rule

ParetoProof should select benchmark items from source families that satisfy three minimum conditions:

- the source statement or formal object is identifiable enough to cite and revisit
- the source can be tied to one explicit provenance record in benchmark metadata
- the source family is labeled clearly enough that contamination-sensitive claims are not accidentally overstated

If a proposed benchmark item cannot meet those three conditions, it should not become an active benchmark item.

## Source families in scope

ParetoProof MVP should recognize the following source families.

### Olympiad and contest archives

These are publicly circulated competition statements or archive problems drawn from:

- olympiad archives
- named competition sets
- training sets derived from a named contest ecosystem when the original source is still traceable

These sources are in scope because they provide compact, well-bounded statements with recognizable provenance. They often fit theorem-formalization or proof-generation work well, but they are usually contamination-sensitive because they are widely circulated.

### Textbooks and expository collections

These are problems or theorem statements drawn from:

- textbooks
- lecture notes
- exercise sets
- curated expository collections with stable authorship or editorial ownership

These sources are in scope when the exact edition, chapter, exercise, theorem, or note location can be cited. They are often good candidates for benchmark families that want clear mathematical pedagogy and topic coverage rather than contest-style one-shot novelty.

### Papers and monographs

These are theorem statements or problem formulations taken from research papers, surveys, or monograph-style published sources.

These sources are in scope when the benchmark can state exactly which claim, proposition, theorem, or problem formulation is being adapted. They are often valuable for research-like tasks, but they need careful curation because paper prose can hide assumptions or surrounding context that must be normalized into a benchmark-owned statement package.

### Formalized corpora

These are benchmark candidates derived from an already formalized theorem corpus or machine-checkable library, such as:

- repository-owned formal benchmark packages
- published Lean formalizations
- benchmark-owned snapshots of an external formal corpus

These sources are in scope, but they require explicit labeling because they are inherently contamination-prone for tasks that aim to measure novel formalization or unseen proof discovery. They are often still valuable for verifier testing, runner regression, proof repair, or controlled proof-generation tasks where the benchmark explicitly accepts that prior formalization exists.

### Original ParetoProof curation

These are items whose canonical benchmark statement package is authored or substantially reconstructed by ParetoProof rather than copied directly from one published source.

This source family is in scope only when the benchmark still records what raw material it was built from, such as:

- a public original source statement
- several source statements merged into one curated benchmark item
- a benchmark-owned normalization of a theorem statement whose published wording was too ambiguous for direct use

`original_paretoproof` is therefore a provenance label for benchmark-owned editorial authorship, not a license to drop provenance altogether.

## Informal-to-formal tasks are not a source family

`informal_to_formal` work is a benchmark task shape, not an upstream source category.

For example:

- an olympiad statement can feed an informal-to-formal benchmark
- a textbook theorem can feed an informal-to-formal benchmark
- a paper proposition can feed an informal-to-formal benchmark

The source family answers "where did this item come from?" The task mode answers "what is the system expected to produce from that source material?" ParetoProof should keep those two concepts separate in metadata and curation review.

## Contamination constraints

Source selection must preserve honest claims about what a benchmark result means.

The minimum contamination rules are:

- if a benchmark item comes from an already formalized corpus, the benchmark must record that fact explicitly
- if the canonical benchmark statement is already widely circulated in formalized form, the benchmark must not describe that item as a novelty-sensitive statement-formalization task
- if a source family is known to have many near-duplicate online solutions, the benchmark may still use it, but should not treat it as a clean hold-out without a separate disclosure decision
- if ParetoProof adopts or mirrors an upstream formal solution, that provenance must be recorded rather than presented as if the benchmark discovered the reference proof independently

The contamination rule is not "never use popular sources." The rule is "label source exposure honestly so downstream evaluation claims stay defensible."

## Provenance requirements

Every selected benchmark item must preserve enough provenance to reconstruct where the statement came from and how ParetoProof adapted it.

The minimum provenance record should answer:

- what source family the item belongs to
- what exact source object the item came from
- whether the source was informal, already formalized, or both
- whether ParetoProof materially rewrote or normalized the statement
- whether an upstream official or prior formal solution exists and is known

At minimum, source selection should preserve these details in benchmark metadata or adjacent curation notes:

- source family label
- human-readable citation
- stable URL when public and durable
- author, editor, or curator attribution when known
- publication or release date when known
- exact source locator such as theorem number, exercise number, or archive entry id
- statement-license or redistribution status
- note on whether the item was already formalized upstream

If ParetoProof materially edits the statement during intake, the curation record should also preserve a short adaptation note so later reviewers know the benchmark package is not a byte-for-byte copy of the upstream wording.

## Selection guidance by task type

Different source families fit different benchmark tasks better.

### Statement formalization

Prefer sources with:

- stable informal statements
- mathematically precise wording
- enough surrounding context to resolve notation and assumptions

Already formalized corpora may still be used for regression or controlled comparison, but they are weak evidence for novelty-sensitive formalization claims unless explicitly labeled as contaminated.

### Proof generation from a canonical formal statement

Prefer sources where ParetoProof can publish:

- one benchmark-owned canonical formal statement
- one provenance record for the originating mathematical source
- one internally validated reference proof when the benchmark is active

Formalized corpora are acceptable here if the benchmark intends a regression or controlled proof-generation task rather than a "never before formalized" claim.

### Proof formalization from informal material

Prefer sources where the benchmark can publish:

- one stable informal problem statement
- optionally one informal proof exposition
- one benchmark-owned canonical formal statement

The source selection boundary here is that the informal proof exposition may come from the source, but the benchmark still needs to own the formal target and provenance record.

## MVP application to `firstproof/Problem9`

The current `firstproof/Problem9` slice is best described as:

- source family: `original_paretoproof`
- task type: direct formal solution generation against a benchmark-owned canonical formal statement
- contamination posture: not a novelty claim about unseen historical source material

That is acceptable for MVP because the current goal is to establish one reproducible vertical slice first. Later benchmark expansion may pull more heavily from textbooks, contest archives, papers, and formalized corpora once the intake and curation workflow is broader.

## Relationship to adjacent baselines

- `problem-statement-metadata-baseline.md` defines the structured source metadata fields that selected items must populate
- `math-artifact-types-baseline.md` defines the task-target artifact types that source families may feed
- `gold-reference-solution-policy-baseline.md` defines the reference-solution requirement after an item is selected
- issue `#39` should define which selected items are good enough to keep, based on difficulty, novelty, contamination, theorem quality, and Lean suitability
- `public-disclosure-holdout-policy-baseline.md` defines the broader disclosure and hold-out policy for selected benchmark material

This document is the source of truth for what kinds of upstream problem sources ParetoProof may curate into benchmark items in the first place.

## Out of scope

- the final curation-quality threshold for accepting or rejecting candidate items
- exact contributor workflow for adding new benchmark items
- publication timing for private or hold-out benchmark material
- detailed scoring implications for each contamination tier
