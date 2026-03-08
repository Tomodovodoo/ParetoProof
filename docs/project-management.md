# Project Management

This repository uses two kinds of GitHub issues:

- **Scoping issues** define open questions and product or architecture decisions.
- **Execution issues** are smaller, completable tasks created from resolved scope.

## Boards

- **Scoping - ParetoProof**: scoping issues only.
- **Roadmap - ParetoProof**: all execution issues. Use backlog views for the full execution backlog, and use timeline views only for currently scheduled short-term work.
- **Team boards**: the broader execution backlog, split by team.

Scoping issues do **not** go on the roadmap. Execution issues do **not** stay on the scoping board. Every non-scoping execution issue should appear on the roadmap and on exactly one team board.

## Teams

- **Admin**: tasks that require the repository owner or another human to use external access directly, such as account setup, domain attachment, secret entry, platform configuration, or vault/bootstrap setup.
- **Project Ops**: CI/CD, automation, release process, workflow plumbing, roadmap maintenance, and other project-management or operations work that Codex can usually do for you once access exists.
- **Backend**: API, contracts, data model, authz logic, DB design, and artifact-control-plane work.
- **Frontend**: web app, portal UX, route gating, and live-view behavior.
- **AI Workers**: worker runtime, worker auth, Lean execution environment, and worker/backend contract work.

## Creation Rules

When creating a new issue:

1. If it is still defining the shape of the system, create a **scoping issue**.
2. If the scope is already resolved and the task is completable, create an **execution issue**.
3. Every execution issue should:
   - be a child of a parent scope issue when applicable
   - list direct dependencies in the body
   - be added to exactly one team board
   - be added to **Roadmap - ParetoProof**
   - start in status **Todo** unless it is already blocked by an open dependency
4. Add dates only if the issue is part of the active short-term plan.

## Status Rules

Execution boards use the same status vocabulary:

- `Blocked`
- `Todo`
- `In Progress`
- `Done`

These statuses should mean the same thing across all execution boards.

- `Blocked`: the issue cannot be started yet because at least one direct dependency is still open.
- `Todo`: the issue is ready to be picked up.
- `In Progress`: the issue is actively being worked on.
- `Done`: the issue is complete.

The repository includes a workflow at [.github/workflows/sync-project-metadata.yml](../.github/workflows/sync-project-metadata.yml) that reconciles status drift across execution boards. Because GitHub Actions does not trigger directly from `projects_v2_item` changes, this sync is **eventual**, not instant:

- it runs on a schedule
- it can be run manually
- it also runs on basic issue events

The sync script also derives `Blocked` from the issue body. If the `Depends on` section points at an open issue, the task becomes `Blocked` across execution boards until it is ready. This only works if the dependency list in the issue body stays current.

## Roadmap Rule

The roadmap is the shared execution index for all non-scoping work.

- Put every execution issue on the roadmap.
- Use the backlog view for the complete non-scoping backlog.
- Use the timeline view only for the active short-term plan.
- Only scheduled short-term issues should have `Start date` and `Target date`.
- Leave date fields empty for backlog items that are not scheduled yet.

By default, do **not** auto-fill `Iteration` or `Quarter`. Set `Start date` and `Target date` only when someone has deliberately scheduled the issue.

## Practical Checklist

For a new execution task:

1. Create the issue.
2. Add the parent scope issue and direct dependency links.
3. Add it to one team board.
4. Add it to **Roadmap - ParetoProof**.
5. Set `Team`.
6. Leave status at `Todo` unless it is currently blocked by an open dependency.
7. Leave `Start date` and `Target date` empty unless it is part of the current short-term plan.
