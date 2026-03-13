# Mathematical Artifact Types Baseline

This document defines the in-scope mathematical artifact types for ParetoProof. The goal is to keep benchmark curation and task design anchored to a small, explicit set of mathematical objects instead of an open-ended pile of surrounding material.

## Primary in-scope artifact types

ParetoProof MVP recognizes four primary mathematical artifact types.

| Artifact type | Canonical meaning | Typical format | Machine-verifiable by itself | Typical role |
| --- | --- | --- | --- | --- |
| `informal_problem_statement` | Human-readable statement of the mathematical task or theorem | markdown, plain text, scanned source transcribed into text | no | benchmark input |
| `informal_proof_exposition` | Human-readable proof idea, derivation, or argument for the target statement | markdown, plain text, paper prose | no | optional benchmark input or reference context |
| `formal_problem_statement` | Machine-checkable formal theorem target or specification | Lean theorem statement plus imports/support context | yes, as a target/specification | benchmark input |
| `formal_solution_proof` | Machine-checkable proof or solution for the formal problem statement | Lean source that verifies against the formal statement | yes | benchmark target output or gold/reference artifact |

These four are the only mathematical artifact types that ParetoProof should treat as first-class benchmark objects in the MVP scope.

## Supporting but non-primary artifacts

Some repository objects are important, but they are not separate mathematical artifact types:

- benchmark-owned support modules and helper definitions
- package manifests, dependency pins, and environment metadata
- verifier outputs, compiler diagnostics, and run transcripts
- artifact manifests, bundle metadata, and ingest records

These are execution, packaging, or reproducibility artifacts. They matter operationally, but they are not themselves mathematical benchmark content.

## Relationship between artifact types

The intended mathematical chain is:

1. an `informal_problem_statement` describes the task in human mathematical language
2. a `formal_problem_statement` captures the same task as a machine-checkable theorem or specification
3. an `informal_proof_exposition` may explain why the statement is true in ordinary mathematical language
4. a `formal_solution_proof` proves the `formal_problem_statement` inside the chosen formal system

Important distinctions:

- `formal_problem_statement` is not the same thing as `formal_solution_proof`
- `informal_proof_exposition` is optional benchmark input, not required for every item
- a gold proof is still just a `formal_solution_proof`; it is benchmark-owned rather than model-produced

## Benchmark task mapping

Each benchmark task should name both its source artifact types and its required target artifact types.

### Statement formalization

- sources: `informal_problem_statement`
- target: `formal_problem_statement`
- verification authority: theorem/specification review plus later formal-check consistency

This task measures whether a system can translate informal mathematics into a precise formal target.

### Proof formalization

- sources: `informal_problem_statement`, `informal_proof_exposition`, and usually a canonical `formal_problem_statement`
- target: `formal_solution_proof`
- verification authority: formal checker verdict against the canonical `formal_problem_statement`

This task measures whether a system can turn a human mathematical argument into a machine-checkable proof.

### Direct formal solution generation

- sources: `formal_problem_statement`
- target: `formal_solution_proof`
- verification authority: formal checker verdict against the same formal statement

This is the current ParetoProof MVP kernel for `firstproof/Problem9`.

### Proof repair or proof completion

- sources: `formal_problem_statement` plus partial `formal_solution_proof`
- target: completed or corrected `formal_solution_proof`
- verification authority: formal checker verdict against the same formal statement

This is a valid later benchmark mode, but it still targets the same core artifact type rather than introducing a fifth mathematical artifact type.

## Current MVP mapping for Problem 9

The current `firstproof/Problem9` package already fits this taxonomy:

- `statements/problem.md` is the canonical `informal_problem_statement`
- `FirstProof/Problem9/Statement.lean` is the canonical `formal_problem_statement`
- `FirstProof/Problem9/Gold.lean` is the benchmark-owned gold `formal_solution_proof`
- `FirstProof/Problem9/Support.lean` is supporting formal context, not a separate primary artifact type

The current offline benchmark slice evaluates model-produced `formal_solution_proof` artifacts against the canonical `formal_problem_statement`. It does not currently require an `informal_proof_exposition` artifact for Problem 9.

## Explicit exclusions

The following are out of scope as primary mathematical artifact types for MVP:

- answer-only artifacts such as a final number or short result string without the surrounding statement or proof object
- diagrams, images, or handwritten pages treated as the sole authoritative benchmark object
- computational notebooks, CAS worksheets, or exploratory scratch files used as informal support material
- chat transcripts, prompt logs, or chain-of-thought style reasoning traces
- benchmark items whose only target is free-form natural-language proof writing without any formal verification boundary
- multiple competing formal statement variants without one canonical benchmark-owned target

These materials may still appear as provenance, supporting evidence, or future auxiliary context, but they are not first-class mathematical artifact types for ParetoProof benchmarking.

## Curation rule

Every benchmark item should declare:

- which in-scope source artifact types it publishes
- which one target artifact type the benchmark expects the system to produce
- which artifact type acts as the verification authority

If a proposed benchmark task cannot be described using the four in-scope artifact types above plus ordinary support metadata, it should be treated as out of scope or as a request for a new scope decision rather than silently added to the benchmark family.
