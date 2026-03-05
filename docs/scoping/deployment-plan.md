# Deployment Plan

## Recommendation

Start local-first, not cloud-first.

The first problem to solve is trustworthy evaluation, not internet-scale hosting.

## Phase 0: repository and workflow

- GitHub repository as source of truth.
- GitHub Issues, Discussions, and Project board for collaboration.
- GitHub Actions for docs checks and lightweight automation.

## Phase 1: single-maintainer execution

- Local `docker compose` or a single VM for workers.
- Pinned Lean image.
- Local or managed PostgreSQL.
- Object storage only when artifact volume justifies it.

This is enough to prove the evaluation loop and avoid premature infra complexity.

## Phase 2: low-ops hosted MVP

When reproducible local runs are stable, move to:

- managed PostgreSQL,
- S3-compatible object storage,
- one small API service,
- one or more long-lived worker machines.

For execution, prefer long-lived workers over pure serverless. Lean jobs and autonomous agent runs are bursty, artifact-heavy, and may exceed the sweet spot for serverless time limits.

## Phase 3: public reporting

- Static docs and benchmark reports via GitHub Pages.
- Optional dashboard once schema and release cadence stabilize.
- Public artifacts linked from each reported run.

## Hosting guidance

- Docs: GitHub Pages is sufficient at the start.
- API: move only when you need external consumers or a public dashboard.
- Workers: local workstation first, then a single dedicated VM if needed.

The right early posture is operationally boring infrastructure with strong reproducibility, not a wide deployment footprint.
