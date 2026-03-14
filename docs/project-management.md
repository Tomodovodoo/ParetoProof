# Project Management

ParetoProof keeps project-management docs short too.

## Issue types

- scoping issues decide a boundary and decompose it into execution work
- execution issues implement one concrete change

A scoping issue is only complete when it produces a clear implementation path. If the decision landed but the follow-up work was never opened, the scope is not really done.

## Boards

- `Scoping - ParetoProof` is for scoping issues only
- `Roadmap - ParetoProof` is for execution work
- team boards hold the execution backlog by ownership

## PR rule

- execution work should land through a PR, not a direct push to `main`
- PRs should link the issue they implement with real issue references
- if review uncovers more work than the current issue covers, open a follow-up issue instead of hiding it in comments
- if a PR is superseded, preserve any still-actionable review findings in the replacement PR or a linked issue

## Status rule

Execution work should use a small, consistent status set across boards:

- `Blocked`
- `Todo`
- `In Progress`
- `Done`
