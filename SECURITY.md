# Security Policy

## Reporting a vulnerability

Do not open a public issue for credential leaks, sandbox escapes, unsafe runner behavior, or anything that could expose model/provider keys or evaluation infrastructure.

Instead, report privately to the repository maintainer through GitHub or another trusted channel and include:

- a clear description of the issue,
- reproduction steps if known,
- impact,
- any suggested mitigation.

## Scope

Security-sensitive areas include:

- model-provider credentials,
- evaluation runners and sandboxes,
- GitHub Actions workflows,
- dataset or artifact storage,
- any infrastructure used to execute untrusted model output.
