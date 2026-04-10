import assert from "node:assert/strict";
import test from "node:test";

import { hasExpectedCanonicalModules } from "../lib/problem9-package-cohesion.mjs";

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
