# Public Disclosure and Hold-out Policy Baseline

This document defines which benchmark material ParetoProof may publish openly, which material may remain internal as hold-out content, and what discussion constraints apply while an item is still withheld.

The goal is to stop benchmark curation from mixing public benchmark releases, private curation work, and opaque hold-out evaluation into one blurry policy. ParetoProof needs one explicit rule for when a benchmark item is publicly claimable and one separate rule for what may stay private.

## Core decision

ParetoProof MVP should separate benchmark material into two disclosure classes:

- `public_released`: benchmark material that is intentionally published and may support public benchmark claims
- `internal_holdout`: benchmark material that remains private during curation, internal validation, or a limited hold-out period

The important policy boundary is:

- public benchmark comparisons and public score claims must rely only on `public_released` items
- ParetoProof may maintain an `internal_holdout` set, but it is for internal validation, curation, or release-readiness checks rather than for opaque public leaderboard claims

This means the repository may contain both public benchmark policy docs and internal-hold-out process rules, but the public repo must not itself contain the withheld benchmark content.

## What counts as benchmark material

For this policy, benchmark material includes:

- the informal statement text
- the canonical formal statement
- the benchmark package or any equivalent machine-consumable package snapshot
- gold or reference artifacts
- benchmark-specific hints, editorial notes, or curation notes that reveal the task
- per-item run results or reports that materially reveal the held-out item

This policy is broader than artifact storage alone. A benchmark item can leak through issue bodies, PR titles, CI logs, screenshots, or review comments even if the package files themselves are private.

## `public_released` benchmark items

An item is `public_released` only when ParetoProof intentionally publishes enough benchmark-owned material for outside readers to identify the benchmark target and understand what public results refer to.

For MVP, that means the public release should include:

- the canonical benchmark item id and version
- the benchmark-owned informal statement or other published source statement
- the canonical formal statement when the benchmark expects formal-proof evaluation
- the public provenance and license metadata needed by the statement baseline
- the benchmark package version or equivalent public benchmark-package identity when public results cite that item

The gold or reference artifact may still be public or internal according to [gold-reference-solution-policy-baseline.md](gold-reference-solution-policy-baseline.md). Public release of the statement package does not force public release of the gold proof.

Once an item is `public_released`, ParetoProof may:

- commit its benchmark package and statement artifacts to the public repository
- discuss the statement and target openly in issues, PRs, docs, and contributor channels
- include per-item public benchmark reports and reproducible public result claims

## `internal_holdout` benchmark items

An item is `internal_holdout` when ParetoProof intentionally withholds the benchmark target from the public and from normal contributor-facing materials for some period of time.

Allowed MVP reasons include:

- internal release-readiness checks before a public benchmark release
- curation work on candidate benchmark items that should not be publicly exposed yet
- limited hold-out evaluation meant to detect overfitting to the already-public benchmark set

`internal_holdout` does not mean "unreviewed" or "informal." A held-out item still needs the same internal correctness, provenance, and package-discipline standards that public benchmark items require before it is trusted for internal evaluation.

The key restriction is:

- `internal_holdout` items must not be used as the basis for public comparable benchmark scores, rankings, or item-level claims while the item remains withheld

## Where hold-out material may live

Because this repository is public, held-out benchmark material must not live in the public repo in any content-revealing form.

For MVP, `internal_holdout` material must stay in private storage such as:

- a private benchmark workspace or internal repository
- restricted benchmark packages or private object storage
- private curation notes or internal review records

The public repository may still contain:

- generic policy docs about how hold-out works
- opaque issue tracking entries that do not reveal the problem content
- execution or scoping tasks phrased at the process level rather than with held-out benchmark text

It must not contain:

- the held-out statement text
- the canonical formal target
- the held-out benchmark package
- gold or reference files for the held-out item
- screenshots, logs, or diff hunks that reveal those artifacts

## Discussion and curation constraints

While an item is `internal_holdout`, public discussion must stay process-level.

Public issues, PRs, docs, and comments must not reveal:

- the full statement text
- enough theorem wording to reconstruct the target
- the exact formal theorem target
- proof ideas or benchmark-owned hints that materially reduce the hold-out value
- repository paths, package names, or benchmark ids that directly expose the held-out item

For MVP, the safe public pattern is:

- discuss the policy, workflow, or benchmark-family process in public
- discuss held-out item content only in private review channels or private storage

If a public thread needs to refer to a held-out item operationally, it should use an opaque internal tracking id and avoid content-bearing titles.

## Public claims and reporting rule

ParetoProof should not publish opaque benchmark claims derived from undisclosed items.

While an item remains `internal_holdout`, ParetoProof may:

- use it for internal smoke tests
- use it for internal regression checks
- use it for private release-readiness evaluation

ParetoProof should not, while the item is still withheld:

- publish per-item scores
- fold its outcomes into the public leaderboard or public benchmark aggregate
- claim a model's public ParetoProof score using hidden items that outside readers cannot inspect

If ParetoProof later wants to describe internal hold-out work publicly before disclosure, the description should stay high level, such as:

- the project maintains an internal hold-out set
- hold-out runs are used for internal evaluation hygiene

It should not publish model-comparison numbers from those items as if they were part of the public benchmark record.

## Transition from hold-out to public release

When a held-out item is disclosed, the item should transition through an explicit public release step rather than by quiet leakage.

That transition should publish:

- the public benchmark item id and version
- the released statement package and metadata
- the released benchmark package or equivalent public package identity
- the disclosure state of any gold or reference artifact

For public benchmark reporting, the safe MVP rule is:

- public comparable results should be anchored to the publicly released benchmark package version

If internal runs existed before disclosure, they may still inform internal history, but public benchmark tables should be regenerated or otherwise re-anchored to the released benchmark package and public evidence boundary rather than relying on opaque pre-release runs.

## Relationship to status and gold visibility

Disclosure state is not the same as curation lifecycle state.

- `statementStatus` from [problem-statement-metadata-baseline.md](problem-statement-metadata-baseline.md) still tracks whether an item is `draft`, `candidate`, `active`, and so on
- disclosure state tracks whether the item is public or held out
- gold visibility from [gold-reference-solution-policy-baseline.md](gold-reference-solution-policy-baseline.md) tracks whether the reference artifact is public or internal

These axes must stay separate because:

- an item may be `active` for internal hold-out use without being publicly released
- an item may be `public_released` while still using an internal gold artifact
- an item may be `candidate` and not yet be either a public benchmark item or a trusted hold-out evaluation item

## MVP application to `firstproof/Problem9`

The current `firstproof/Problem9` slice is `public_released`.

That means:

- the statement package is public in the repository
- the benchmark package boundary is public
- the gold artifact is public in the current MVP slice
- public reproducibility and verifier docs may refer to the item directly

Problem 9 is therefore not part of any hidden hold-out set.

## Relationship to adjacent baselines

- [problem-statement-metadata-baseline.md](problem-statement-metadata-baseline.md) defines the statement package and metadata fields that public releases must publish
- [source-problem-selection-baseline.md](source-problem-selection-baseline.md) defines what source families and contamination notes a selected item must carry before disclosure is decided
- [gold-reference-solution-policy-baseline.md](gold-reference-solution-policy-baseline.md) defines whether gold or reference artifacts exist and whether they may remain internal
- [artifact-retention-access-baseline.md](artifact-retention-access-baseline.md) defines storage visibility and retention for artifact objects after disclosure state has been decided

This document is the source of truth for whether benchmark material may be published openly, kept private as hold-out content, or discussed only at the process level.

## Out of scope

- the exact private system or repository used to store held-out benchmark material
- contributor-facing UI for requesting access to non-public benchmark material
- future publication cadence for benchmark releases
- legal review beyond the ordinary statement-license and redistribution rules
