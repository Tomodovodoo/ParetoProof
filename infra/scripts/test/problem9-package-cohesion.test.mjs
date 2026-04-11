import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hasApacheTwoLicenseText,
  hasExpectedAxiomSafetyNarrative,
  hasExpectedCanonicalModules,
  hasExpectedLanePolicy,
  hasExpectedProblem9SourceMetadata,
  hasExpectedSupportedLanes
} from "../lib/problem9-package-cohesion.mjs";

const expectedCanonicalModules = {
  statement: "FirstProof.Problem9.Statement",
  support: "FirstProof.Problem9.Support",
  gold: "FirstProof.Problem9.Gold"
};

test("hasExpectedCanonicalModules ignores object key order", () => {
  assert.equal(
    hasExpectedCanonicalModules(
      {
        gold: "FirstProof.Problem9.Gold",
        statement: "FirstProof.Problem9.Statement",
        support: "FirstProof.Problem9.Support"
      },
      expectedCanonicalModules
    ),
    true
  );
});

test("hasExpectedCanonicalModules rejects missing or mismatched module bindings", () => {
  assert.equal(
    hasExpectedCanonicalModules(
      {
        statement: "FirstProof.Problem9.Statement",
        gold: "FirstProof.Problem9.Gold"
      },
      expectedCanonicalModules
    ),
    false
  );

  assert.equal(
    hasExpectedCanonicalModules(
      {
        statement: "FirstProof.Problem9.Statement",
        support: "FirstProof.Problem9.DifferentSupport",
        gold: "FirstProof.Problem9.Gold"
      },
      expectedCanonicalModules
    ),
    false
  );
});

test("hasExpectedSupportedLanes accepts only the repo-backed Problem 9 lane", () => {
  assert.equal(hasExpectedSupportedLanes(["lean422_exact"]), true);
  assert.equal(hasExpectedSupportedLanes(["lean422_exact", "lean424_interop"]), false);
  assert.equal(hasExpectedSupportedLanes([]), false);
});

test("hasExpectedLanePolicy rejects primary-lane drift", () => {
  assert.equal(
    hasExpectedLanePolicy({
      primaryLane: "lean422_exact",
      supportedLanes: ["lean422_exact"]
    }),
    true
  );

  assert.equal(
    hasExpectedLanePolicy({
      primaryLane: "lean424_interop",
      supportedLanes: ["lean422_exact"]
    }),
    false
  );
});

test("hasExpectedProblem9SourceMetadata accepts the canonical source metadata block", () => {
  assert.equal(
    hasExpectedProblem9SourceMetadata({
      regressionEvidence: {
        integrityTest: "node --import tsx --test test/problem9-integrity.test.ts",
        cohesionCheck: "bun run check:problem9-package-cohesion"
      },
      provenance: {
        supportModule: "FirstProof/Problem9/Support.lean",
        goldModule: "FirstProof/Problem9/Gold.lean",
        statementModule: "FirstProof/Problem9/Statement.lean",
        humanStatement: "statements/problem.md"
      },
      license: {
        spdxId: "Apache-2.0",
        file: "LICENSE"
      },
      laneEvidence: {
        lean422_exact: "lean-toolchain"
      }
    }),
    true
  );
});

test("hasExpectedProblem9SourceMetadata rejects missing regression linkage", () => {
  assert.equal(
    hasExpectedProblem9SourceMetadata({
      license: {
        file: "LICENSE",
        spdxId: "Apache-2.0"
      },
      provenance: {
        goldModule: "FirstProof/Problem9/Gold.lean",
        humanStatement: "statements/problem.md",
        statementModule: "FirstProof/Problem9/Statement.lean",
        supportModule: "FirstProof/Problem9/Support.lean"
      },
      laneEvidence: {
        lean422_exact: "lean-toolchain"
      }
    }),
    false
  );
});

test("hasExpectedAxiomSafetyNarrative accepts the required Problem 9 safety model", () => {
  assert.equal(
    hasExpectedAxiomSafetyNarrative(`
      ## Axiom safety contract

      - Statement.lean intentionally exports axiom problem9 as the stable theorem header.
      - The checked-in axiom is not accepted as benchmark proof evidence.
      - The runtime keeps the checked-in benchmark package read-only and writes model
        output only to FirstProof/Problem9/Candidate.lean.
      - Importing FirstProof.Problem9.Gold is invalid.
      - Passing runs must match the canonical theorem target and clear the
        no-axioms check for FirstProof.Problem9.problem9.
    `, "## Axiom safety contract"),
    true
  );
});

test("hasExpectedAxiomSafetyNarrative rejects incomplete explanations", () => {
  assert.equal(
    hasExpectedAxiomSafetyNarrative(`
      ## Axiom safety model

      - Statement.lean keeps the theorem header stable and Gold.lean carries the
        repository proof.
    `, "## Axiom safety model"),
    false
  );
});

test("hasExpectedAxiomSafetyNarrative rejects contradictory safety claims", () => {
  assert.equal(
    hasExpectedAxiomSafetyNarrative(`
      ## Axiom safety model

      - Statement.lean intentionally exports axiom problem9 as the stable theorem header.
      - The checked-in axiom is not accepted as benchmark proof evidence.
      - The runtime keeps the checked-in benchmark package read-only and writes model
        output only to FirstProof/Problem9/Candidate.lean.
      - Importing FirstProof.Problem9.Gold is invalid.
      - Passing runs must match the canonical theorem target and clear the
        no-axioms check for FirstProof.Problem9.problem9.
      Models may also edit Statement.lean directly if they want.
    `, "## Axiom safety model"),
    false
  );
});

test("hasApacheTwoLicenseText rejects the old stub and accepts the full license", () => {
  assert.equal(
    hasApacheTwoLicenseText([
      "Apache License",
      "Version 2.0, January 2004",
      "http://www.apache.org/licenses/"
    ].join("\n")),
    false
  );

  assert.equal(
    hasApacheTwoLicenseText([
      "Apache License",
      "Version 2.0, January 2004",
      "http://www.apache.org/licenses/",
      "",
      "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION",
      "",
      "END OF TERMS AND CONDITIONS",
      "",
      "APPENDIX: How to apply the Apache License to your work."
    ].join("\n")),
    false
  );

  assert.equal(
    hasApacheTwoLicenseText(
      readFileSync(
        new URL("../../../benchmarks/firstproof/problem9/LICENSE", import.meta.url),
        "utf8"
      )
    ),
    true
  );
});
