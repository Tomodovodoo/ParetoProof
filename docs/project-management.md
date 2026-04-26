# Project Management

ParetoProof keeps project-management docs short too.

## Issue types

- scoping issues decide a boundary and decompose it into execution work
- execution issues implement one concrete change

A scoping issue is only complete when it produces a clear implementation path. If the decision landed but the follow-up work was never opened, the scope is not really done.

## Boards

- `Scoping - ParetoProof` is for scoping issues only
- `Roadmap - ParetoProof` is for execution work
- execution issues should also sit on exactly one team board by ownership:
  - `Frontend - ParetoProof`
  - `Backend - ParetoProof`
  - `AI Workers - ParetoProof`
  - `Infrastructure / Deployment - ParetoProof`
  - `Admin - ParetoProof`
- scoping work stays off the roadmap board until it has been decomposed into execution issues
- backlog issues should stay undated until they are actually scheduled

## PR rule

- execution work should land through a PR, not a direct push to `main`
- PRs should link the issue they implement with real issue references
- a slice is not promotion-ready just because the PR is generally green; reviewers must check the specific promotion evidence listed in [runtime.md](./runtime.md) when worker, image, auth, or runtime surfaces move
- if review uncovers more work than the current issue covers, open a follow-up issue instead of hiding it in comments
- if a PR is superseded, preserve any still-actionable review findings in the replacement PR or a linked issue
- if a PR reaches 5+ comments or attracts Codex/Aardvark findings, add one short feedback-disposition note on the linked issue before merge: resolved here, carried by PR #..., or followed up in issue #...
- use `bun run report:dead-end-issues -- --limit 200` during cleanup passes to find closed issues that still have no issue, PR, or commit relationship signals on GitHub

## Promotion Rule

- treat `main` promotion as a kernel-evidence gate, not a generic "CI looks green" judgment
- the required pre-merge evidence source is the `Pull Request CI` workflow on the exact PR head that will merge
- when a slice touches worker execution, image packaging, auth handoff, or runtime validation, reviewers should read the named smoke and boundary steps listed in [runtime.md](./runtime.md) instead of inferring health from unrelated UI, build, or typecheck steps
- post-merge publish workflows may add release evidence such as image digests, but they do not replace the pre-merge PR smoke gate
- manual production deploys must not bypass the main-branch promotion path; Pages production deploys are sourced from `main`, while rollback should use a Cloudflare Pages rollback or a revert/fix on `main`

## Status rule

Execution work should use a small, consistent status set across boards:

- `Blocked`
- `Todo`
- `In Progress`
- `Done`

## Audit note

- the feedback-disposition note should live on the implementing issue so future audits have one durable place to read the result
- PR #470 is the model example for a review-heavy thread whose still-actionable finding was preserved into follow-up issue #752 instead of dying in the superseded PR
