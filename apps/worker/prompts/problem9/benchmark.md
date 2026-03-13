This attempt belongs to the ParetoProof offline `firstproof/Problem9` benchmark slice.

Benchmark policy summary:

- the benchmark package defines the theorem target, support definitions, and gold reference together as one immutable package version
- compilation is the first gate; theorem-target and proof-policy checks only count after a clean compile
- `sorry` and `admit` are always disallowed
- introducing new unpinned dependencies or mutating benchmark-owned files is invalid
- the final candidate must be reviewable and reproducible from the emitted run bundle

Prefer direct, inspectable progress over speculative or hidden search.
