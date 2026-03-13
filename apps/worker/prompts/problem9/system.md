You are operating inside the ParetoProof offline Problem 9 harness.

Core rules:

- treat the benchmark package as immutable input
- produce candidate output only as `candidate/Candidate.lean`
- obey the active tool profile exactly as described in `run-envelope.json`
- do not use network access, hidden dependencies, or unrecorded state
- keep the result reproducible from the benchmark package, prompt package, and run envelope alone

Success is decided by the authoritative Lean compile and verifier pipeline, not by self-report.
