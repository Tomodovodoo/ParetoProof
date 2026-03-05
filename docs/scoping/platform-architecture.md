# Platform Architecture

## Design principles

- Reproducible: every run should be reconstructible from versioned inputs.
- Auditable: artifacts should be inspectable, not hidden behind aggregate scores.
- Cheap to start: a single maintainer should be able to run the MVP.
- Extensible: new providers, tracks, and tool policies should fit the same schema.

## Recommended architecture

### Source of truth

Keep benchmark definitions, schemas, policies, and public result manifests in git.

### Control plane

Use a small Python service for orchestration and metadata:

- `FastAPI` for admin and read APIs,
- `Pydantic` models aligned with repository schemas,
- `PostgreSQL` for run metadata and evaluation state.

Python is the pragmatic choice here because the surrounding ecosystem for evals, analytics, provider SDKs, and Lean-related scripting is strongest there.

### Execution plane

Run Lean evaluations in containerized workers with a pinned Lean/toolchain image.

Workers should:

- receive a fully versioned run manifest,
- execute in a sandbox with explicit limits,
- emit stdout, stderr, patches, and result metadata,
- upload artifacts to object storage,
- never require broad repository write access.

### Storage

- `PostgreSQL` for structured metadata and run state.
- `S3-compatible object storage` for prompts, traces, logs, diffs, and compiled artifacts.
- Git for benchmark specs, adjudication notes, and public manifests.

### Web layer

Do not start with a heavy product surface.

For the MVP:

- GitHub README + docs are the public home,
- GitHub Pages can host static documentation,
- a future dashboard can be layered on top once the data model stabilizes.

## Why not start with a large SaaS stack

Long-running Lean jobs, provider-key management, and artifact-heavy evaluation do not benefit from premature frontend or multi-tenant complexity. The bottleneck is trustworthy execution, not product surface area.
