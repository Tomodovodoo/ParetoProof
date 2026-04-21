## Summary

- Tighten governance guards so workflow policy, PR-body governance, and startup-validation claims stay aligned.

## Linked issues

- Closes #1021

## Verification

- [x] Commands run are listed below
- [x] Relevant logs, artifact paths, or screenshots are linked or described
- [x] New or changed contracts are wired through implementation, not only documented

```text
node infra/scripts/check-pr-governance-body.mjs --body-file infra/scripts/fixtures/governance/pr-body-valid.md
node infra/scripts/check-main-branch-promotion-gate.mjs
```

## Security and cost review

- [x] No new auth, CSRF, secret-handling, or data-exposure risk was introduced without mitigation or a linked follow-up issue
- [x] For security-sensitive changes, the threat boundary and mitigation are described below
- [x] Cost or rate-limit impact is described below when relevant
- Threat boundary: merge-time governance only; no new runtime secrets or auth flows are introduced.
- Cost: not applicable.

## Rollout and rollback

- [x] Rollout plan is described or marked not applicable
- [x] Rollback plan is described or marked not applicable
- Rollout: merge and let `Pull Request CI / ci` enforce the new governance checks before promotion.
- Rollback: revert the governance-check change set.

## Notes

- Not applicable.
