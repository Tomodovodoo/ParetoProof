# AI Automation

## Goal

Use Codex/OpenAI automation to reduce coordination drag without turning the repository into an untrusted autopilot.

## Recommended path

### Preferred

Use the native Codex GitHub integration where available for pull-request review and repository-aware assistance.

### Repository-local fallback

Keep a lightweight repository workflow that can:

- respond to `/codex` issue and pull-request comments,
- produce high-signal review summaries on pull requests,
- avoid pushing code directly to `main`,
- operate only with explicit repository secrets and narrow permissions.

## Guardrails

- AI review should comment, not merge.
- AI responses should focus on concrete bugs, risks, and missing tests.
- Benchmark-scoring policy should never be changed by automation alone.
- Provider secrets should live in GitHub secrets, not in code or issue text.

## Why this matters here

ParetoProof is likely to attract interdisciplinary contributors. Good automation can help with:

- fast triage,
- issue clarification,
- PR review throughput,
- consistent doc feedback,
- keeping operational knowledge discoverable.
