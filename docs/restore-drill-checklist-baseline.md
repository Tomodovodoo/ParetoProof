# MVP Restore Drill Checklist Baseline

This document defines the minimum restore drill checklist for the MVP stack. The drill must validate that ParetoProof can recover:

- database state (Neon)
- artifact objects (R2)
- deployable revisions (Git SHA -> deploy artifact mapping)

## Drill frequency and ownership

- cadence: at least once per quarter and after any major backup or deploy workflow change
- drill owner: ParetoProof repository owner
- required participants: owner plus one reviewer who did not execute the restore steps
- required output: dated drill record with pass/fail status and follow-up actions

## Preconditions

Before starting a drill:

- confirm release mapping records exist for the test window (`git SHA`, deployment ids, image digests)
- confirm Neon branch or point-in-time restore path is available
- confirm R2 bucket and prefix inventory is available for drill scope
- confirm no production-impacting migrations are in progress
- choose either:
  - non-production drill environment, or
  - production-snapshot-to-validation-branch workflow

## Checklist

### 1) Define drill scope

- choose one concrete restore target window (for example one recent run plus one recent deploy)
- identify exact target artifacts:
  - one API deployment mapping entry
  - one worker image digest mapping entry
  - one run artifact prefix set in R2
- write down expected counts/checksums before restore

### 2) Neon database recovery rehearsal

- create a Neon restore branch or equivalent recovery target from the selected point in time
- validate schema compatibility for current API expectations
- run targeted data checks:
  - key auth/control-plane tables present
  - expected run rows and linked metadata present
- record pass/fail and any schema drift risks

### 3) R2 artifact recovery rehearsal

- select drill prefixes in artifacts/exports buckets
- verify object inventory against expected key list
- verify sample checksum/size metadata matches recorded values
- simulate missing-object handling:
  - mark one object as unavailable in drill notes
  - validate incident record process for partial recovery
- record pass/fail and gaps

### 4) Deployable version recovery rehearsal

- reconstruct one deploy chain from records:
  - `git_sha -> web/pages deployment id`
  - `git_sha -> api deployment id`
  - `git_sha -> worker image digest`
- verify each mapping is queryable without manual dashboard archaeology
- verify rollback target selection is possible from recorded data alone

### 5) End-to-end consistency checks

- ensure restored database state references artifact keys that exist in the recovered R2 scope
- ensure chosen rollback deploy artifacts correspond to the same expected release window
- document any cross-surface incompatibility risk (schema or contract mismatch)

### 6) Sign-off and follow-up

- capture final drill status: `pass`, `pass_with_actions`, or `fail`
- open follow-up issues for every gap with owner and severity
- attach or link evidence:
  - Neon restore branch id or recovery reference
  - sampled R2 key/checksum evidence
  - release mapping entries used in the drill
- set next scheduled drill date

## Failure handling rules

- if any critical restore step fails, mark drill as `fail`
- do not treat partial success as restore readiness
- complete at least one successful re-drill after critical fixes before clearing restore risk

## Out of scope

- full incident communication templates
- production traffic failover design
- automated one-click disaster recovery orchestration
