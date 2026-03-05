# Collaboration Model

## Recommended communication split

### GitHub Discussions

Use Discussions for:

- benchmark design proposals,
- requests for collaboration,
- model-evaluation methodology debates,
- onboarding questions,
- release announcements and benchmark reports.

These conversations are searchable, linkable, and durable.

### GitHub Issues

Use Issues for:

- executable tasks,
- benchmark-item additions,
- model integrations,
- bugs,
- infra work,
- documentation gaps with a clear definition of done.

### GitHub Projects

Use the project board as the execution layer:

- `Inbox`: newly opened issues,
- `Ready`: scoped and prioritized,
- `In Progress`: actively owned,
- `Review`: awaiting merge or sign-off,
- `Done`: finished.

### Discord

Use Discord only for:

- quick coordination,
- recruiting contributors,
- short synchronous brainstorming,
- office hours or ad hoc calls.

Any technical decision made in Discord should be summarized back into GitHub within 24 hours.

## Working agreements

- If the scope is fuzzy, open a Discussion before opening a large Issue.
- If the work affects the roadmap, add it to the Project board.
- If the work changes the project's long-term shape, record it in an ADR.
- If an evaluation result is public, the run manifest and artifacts must be recoverable.

## Suggested cadence

- Weekly triage on open issues and discussion threads.
- Milestone-based public benchmark drops instead of constant leaderboard churn.
- Monthly cleanup of stale or under-specified work items.
