import assert from "node:assert/strict";
import test from "node:test";

import {
  hasExpectedAxiomSafetyNarrative,
  hasExpectedCanonicalModules
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
