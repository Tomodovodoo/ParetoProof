# Canonical Problem Statement and Metadata Baseline

This document defines the canonical statement package for one ParetoProof benchmark item and the minimum metadata that must travel with it.

The goal is to stop benchmark items from being identified by an ad hoc mix of markdown prose, Lean files, spreadsheet columns, and issue comments. Every benchmark version should instead expose one clear statement pair plus one explicit metadata record.

## Canonical statement package

One benchmark item version is defined by three coordinated objects:

- one canonical informal problem statement
- one canonical formal problem statement
- one canonical metadata record that describes the statement pair and the expected benchmark output

For the MVP, the informal problem statement is the human-readable authority for what mathematicians and reviewers mean by the problem. The formal problem statement is the machine-checkable authority for what workers and verifiers must target in Lean. The metadata record ties those two statement artifacts to provenance, discoverability, and benchmark-task semantics.

The canonical statement package should be immutable per benchmark version. If the informal statement meaning changes, the formal theorem target changes, or any required metadata field changes in a way that affects benchmark identity, the benchmark item must publish a new version rather than silently editing the old one.

## Required statement artifacts

Every benchmark item version must publish these statement artifacts:

- `informalStatement`: the canonical natural-language problem text
- `formalStatement`: the canonical Lean theorem target or specification

For the MVP, those artifacts should also have stable repository locators:

- `informalStatementPath`: repository-relative path to the published human statement
- `formalStatementPath`: repository-relative path to the Lean statement module
- `formalStatementModule`: canonical Lean module name for the formal statement

The statement package may also reference supporting context such as helper modules, source scans, or editorial notes, but those are supporting artifacts rather than part of the minimal statement pair.

## Required metadata fields

The canonical metadata record for a benchmark item version must include the fields below.

| Field | Type shape | Meaning |
| --- | --- | --- |
| `benchmarkFamily` | string slug | Stable family id such as `firstproof`. |
| `benchmarkItemId` | string slug | Stable item id inside the family such as `Problem9`. |
| `benchmarkVersion` | string | Version identifier for the statement package. |
| `title` | non-empty string | Short human-readable label for the problem. |
| `source` | structured object | Provenance record for where the problem statement came from. |
| `primaryTopic` | string slug | Main mathematical topic used for top-level grouping. |
| `difficulty` | enum | Coarse difficulty tier for contributor and researcher filtering. |
| `tags` | string array | Searchable secondary labels. |
| `statementLicense` | structured object | License and redistribution metadata for the statement package. |
| `statementStatus` | enum | Lifecycle status of the statement package in benchmark curation. |
| `expectedOutputType` | enum from `math-artifact-types-baseline.md` | The artifact type the benchmark expects a system to produce. |
| `informalStatementPath` | repository-relative path string | Canonical path for the published natural-language statement. |
| `formalStatementPath` | repository-relative path string | Canonical path for the Lean statement module. |
| `formalStatementModule` | Lean module string | Canonical import path for the formal statement. |

These fields are the minimum contract. Later benchmark families may add more metadata, but they should extend this record rather than replacing it.

## Required source metadata

`source` must be structured enough to answer both provenance and reuse questions without reopening the benchmark curation discussion every time.

The required source subfields are:

| Field | Type shape | Meaning |
| --- | --- | --- |
| `source.kind` | enum | Origin class for the problem statement. |
| `source.citation` | non-empty string | Human-readable citation or short provenance note. |
| `source.url` | optional URL string | Primary online location when public and stable. |
| `source.authorsOrEditors` | string array | Named source authors, editors, or curators when known. |
| `source.originalPublicationDate` | optional ISO date string | Original publication date when known and relevant. |

Allowed `source.kind` values for MVP are:

- `original_paretoproof`
- `book`
- `paper`
- `olympiad_archive`
- `competition_set`
- `formalized_corpus`
- `community_curated`
- `other_published`

The exact list may expand later, but MVP should keep it coarse and explicit instead of allowing arbitrary free-form provenance categories. The selection and contamination rules behind these source families are defined in `source-problem-selection-baseline.md`.

## Topic, difficulty, and tag rules

### `primaryTopic`

`primaryTopic` is one required slug used for the first-level problem grouping. MVP should keep the topic list intentionally small and reuse it consistently across benchmark families.

The initial allowed values are:

- `algebra`
- `analysis`
- `combinatorics`
- `geometry`
- `number_theory`
- `logic_foundations`
- `other`

If a problem spans several areas, choose one primary topic and place the rest in `tags`.

### `difficulty`

`difficulty` is a required coarse tier, not a precise rating system. The MVP allowed values are:

- `introductory`
- `standard`
- `challenging`
- `research_like`

This tier is meant for filtering and dataset composition, not for making claims of psychometric precision.

### `tags`

`tags` is a list of lowercase slugs for secondary classification such as:

- named techniques
- subfields
- contest or source-family labels
- theorem-family labels

Tags may be empty when the benchmark family truly has no useful secondary labels, but the field itself must still exist so later APIs and exports do not need nullable special-casing.

## License and status metadata

The metadata record must carry both legal reuse information and curation lifecycle status.

### `statementLicense`

`statementLicense` must include:

| Field | Type shape | Meaning |
| --- | --- | --- |
| `statementLicense.licenseId` | SPDX id or `LicenseRef-*` string | Canonical license identifier for the published statement package. |
| `statementLicense.redistributionStatus` | enum | Whether ParetoProof may publish and redistribute the statement artifacts. |
| `statementLicense.notes` | optional string | Short explanation when the license is custom, partial, or needs attribution notes. |

Allowed `statementLicense.redistributionStatus` values for MVP are:

- `redistributable`
- `restricted`
- `needs_review`

The metadata contract does not require every item to be publicly redistributable today, but it does require the repository to record that status explicitly instead of discovering it later by accident.

### `statementStatus`

`statementStatus` tracks curation lifecycle, not public visibility policy. The MVP allowed values are:

- `draft`
- `candidate`
- `active`
- `retired`
- `superseded`

Only `active` items should be used for benchmark runs. Visibility and hold-out policy stay downstream of this baseline and should be defined separately in [public-disclosure-holdout-policy-baseline.md](public-disclosure-holdout-policy-baseline.md) rather than overloaded into `statementStatus`.

## Expected output type rule

`expectedOutputType` must use the mathematical artifact-type vocabulary from [math-artifact-types-baseline.md](math-artifact-types-baseline.md).

For the MVP, the practical allowed values are:

- `formal_problem_statement`
- `formal_solution_proof`

Most current benchmark items should use `formal_solution_proof`, because the current ParetoProof MVP kernel evaluates proof generation against a benchmark-owned canonical formal statement. If a future benchmark family expects statement formalization instead, it should set `expectedOutputType` to `formal_problem_statement` and still publish the canonical formal target needed for comparable evaluation.

## Versioning and immutability rules

The following changes require a new `benchmarkVersion`:

- any semantic change to the informal statement
- any semantic change to the formal theorem target or namespace boundary
- any change to `expectedOutputType`
- any change to source provenance that reidentifies where the item came from
- any change to `statementLicense`
- any change to `statementStatus` from or to `active` when that changes whether the item is benchmark-eligible

Purely additive non-identity metadata such as extra editorial notes may be handled in later schema work, but the MVP should default toward versioning instead of silent mutation.

## MVP application to `firstproof/Problem9`

For the current offline slice, the canonical metadata record for `firstproof/Problem9` should resolve to this shape:

- `benchmarkFamily`: `firstproof`
- `benchmarkItemId`: `Problem9`
- `title`: the canonical Problem 9 label used in the package README and statement docs
- `informalStatementPath`: `statements/problem.md`
- `formalStatementPath`: `FirstProof/Problem9/Statement.lean`
- `formalStatementModule`: `FirstProof.Problem9.Statement`
- `expectedOutputType`: `formal_solution_proof`
- `statementStatus`: `active`

The benchmark package and later database model may expose additional fields, but they should preserve these semantics exactly.

## Deferred questions

This baseline does not decide:

- the exact disclosure state fields or workflow used to implement [public-disclosure-holdout-policy-baseline.md](public-disclosure-holdout-policy-baseline.md)
- exact database column names or JSON schema code
- multilingual statement support
- public API response shape for listing benchmark items
- how gold/reference solution availability is exposed to contributors, which is now partially scoped by `gold-reference-solution-policy-baseline.md` and still leaves the broader disclosure matrix to later work

Those are follow-on scope or execution questions. This document only fixes the minimum canonical statement and metadata contract that later implementation work must preserve.
