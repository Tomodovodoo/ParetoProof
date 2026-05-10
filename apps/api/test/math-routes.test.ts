import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { mathApiContract } from "@paretoproof/shared";
import { parseApiRuntimeEnv } from "../src/config/runtime.ts";
import { buildServer } from "../src/server/build-server.ts";
import { createTrustedMutationOriginHook } from "../src/server/trusted-mutation-origin.ts";
import { registerMathRoutes } from "../src/routes/math.ts";

type TestAccessContext =
  | {
      role: "admin" | "collaborator" | "helper";
      status: "approved";
      userId: string;
    }
  | {
      status: "denied" | "pending";
      userId: string;
    }
  | null;

function hasRole(
  context: Extract<TestAccessContext, { status: "approved" }>,
  role: "admin" | "collaborator" | "helper"
) {
  const roleRank = {
    admin: 3,
    collaborator: 2,
    helper: 1
  } as const;

  return roleRank[context.role] >= roleRank[role];
}

function isAllowed(
  context: NonNullable<TestAccessContext>,
  requirement:
    | "admin_only"
    | "approved_collaborator_or_higher"
    | "approved_helper_or_higher"
    | "authenticated_access_identity"
    | "pending_or_approved"
) {
  if (requirement === "authenticated_access_identity") {
    return true;
  }

  if (requirement === "pending_or_approved") {
    return context.status === "pending" || context.status === "approved";
  }

  if (context.status !== "approved") {
    return false;
  }

  if (requirement === "approved_helper_or_higher") {
    return hasRole(context, "helper");
  }

  if (requirement === "approved_collaborator_or_higher") {
    return hasRole(context, "collaborator");
  }

  return hasRole(context, "admin");
}

type AccessRequirement = Parameters<Parameters<typeof registerMathRoutes>[2]>[0];
type TestGuardReply = {
  code: (code: number) => {
    send: (payload: unknown) => void;
  };
};
type TestGuardRequest = {
  accessRbacContext?: unknown;
};

function createAccessGuard(context: TestAccessContext) {
  return (requirement: AccessRequirement) => {
    return (request: TestGuardRequest, reply: TestGuardReply, done: () => void) => {
      if (!context) {
        reply.code(401).send({
          error: "access_assertion_required"
        });
        return;
      }

      if (!isAllowed(context, requirement)) {
        reply.code(403).send({
          error: "insufficient_role"
        });
        return;
      }

      request.accessRbacContext = context;
      done();
    };
  };
}

const fakeDb = {} as never;

test("registered math route families return typed unavailable responses until persistence lands", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerMathRoutes(
    app,
    fakeDb,
    createAccessGuard({
      role: "helper",
      status: "approved",
      userId: "user-helper"
    }) as never
  );

  const cases = [
    ["/math/questions", "questions"],
    ["/math/questions/problem-9", "question"],
    ["/math/submissions/submission-1", "submission"],
    ["/math/reviews", "reviews"],
    ["/math/reviews/review-1", "review"],
    ["/math/package-candidates", "package_candidates"],
    ["/math/package-candidates/candidate-1", "package_candidate"],
    ["/math/releases", "releases"],
    ["/math/releases/release-1", "release"],
    ["/math/questions/problem-9/launch", "launch"]
  ] as const;

  for (const [url, resource] of cases) {
    const response = await app.inject({
      method: "GET",
      url
    });

    assert.equal(response.statusCode, 501);
    assert.equal(
      mathApiContract.unavailableResponse.safeParse(response.json()).success,
      true
    );
    assert.equal(response.json().resource, resource);
  }
});

test("math submission create requires collaborator access", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerMathRoutes(
    app,
    fakeDb,
    createAccessGuard({
      role: "helper",
      status: "approved",
      userId: "user-helper"
    }) as never
  );

  const response = await app.inject({
    method: "POST",
    payload: {
      equivalenceExpectation: "not_applicable",
      leanSubmissionKind: "lean_formalization_submission",
      mathQuestionId: "problem-9",
      mathQuestionRevisionId: "problem-9-r1"
    },
    url: "/math/questions/problem-9/submissions"
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "insufficient_role"
  });
});

test("math submission create validates the shared payload contract", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerMathRoutes(
    app,
    fakeDb,
    createAccessGuard({
      role: "collaborator",
      status: "approved",
      userId: "user-collaborator"
    }) as never
  );

  const invalidPayloadResponse = await app.inject({
    method: "POST",
    payload: {
      leanSubmissionKind: "lean_formalization_submission",
      mathQuestionId: "problem-9",
      mathQuestionRevisionId: "problem-9-r1"
    },
    url: "/math/questions/problem-9/submissions"
  });
  const mismatchResponse = await app.inject({
    method: "POST",
    payload: {
      equivalenceExpectation: "not_applicable",
      leanSubmissionKind: "lean_formalization_submission",
      mathQuestionId: "other-problem",
      mathQuestionRevisionId: "problem-9-r1"
    },
    url: "/math/questions/problem-9/submissions"
  });

  assert.equal(invalidPayloadResponse.statusCode, 400);
  assert.equal(invalidPayloadResponse.json().error, "invalid_math_submission_payload");
  assert.equal(mismatchResponse.statusCode, 400);
  assert.deepEqual(mismatchResponse.json(), {
    error: "math_submission_question_mismatch"
  });
});

test("math Lean workflow mutations are routed through the math service boundary", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerMathRoutes(
    app,
    fakeDb,
    createAccessGuard({
      role: "collaborator",
      status: "approved",
      userId: "user-collaborator"
    }) as never
  );

  const profileResponse = await app.inject({
    method: "PATCH",
    payload: {
      equivalenceExpectation: "not_applicable"
    },
    url: "/math/submissions/submission-1/lean-profile"
  });
  const reviewGateResponse = await app.inject({
    method: "PATCH",
    payload: {
      state: "satisfied"
    },
    url: "/math/submissions/submission-1/review-gates/policy_review"
  });

  assert.equal(profileResponse.statusCode, 501);
  assert.equal(profileResponse.json().resource, "lean_workflow");
  assert.equal(reviewGateResponse.statusCode, 501);
  assert.equal(reviewGateResponse.json().resource, "lean_workflow");
});

test("trusted mutation origin protects math submissions from portal-origin callers", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  app.addHook(
    "onRequest",
    createTrustedMutationOriginHook({
      allowLocalhostOrigins: false,
      allowedOriginsBySurface: {
        math: ["https://math.preview.paretoproof.com"],
        portal: ["https://portal.preview.paretoproof.com"]
      },
      brandedAuthOrigins: []
    })
  );

  registerMathRoutes(
    app,
    fakeDb,
    createAccessGuard({
      role: "collaborator",
      status: "approved",
      userId: "user-collaborator"
    }) as never
  );

  const payload = {
    equivalenceExpectation: "not_applicable",
    leanSubmissionKind: "lean_formalization_submission",
    mathQuestionId: "problem-9",
    mathQuestionRevisionId: "problem-9-r1"
  };
  const portalOriginResponse = await app.inject({
    headers: {
      origin: "https://portal.preview.paretoproof.com"
    },
    method: "POST",
    payload,
    url: "/math/questions/problem-9/submissions"
  });
  const mathOriginResponse = await app.inject({
    headers: {
      origin: "https://math.preview.paretoproof.com"
    },
    method: "POST",
    payload,
    url: "/math/questions/problem-9/submissions"
  });

  assert.equal(portalOriginResponse.statusCode, 403);
  assert.deepEqual(portalOriginResponse.json(), {
    error: "trusted_origin_not_allowed"
  });
  assert.equal(mathOriginResponse.statusCode, 501);
  assert.equal(
    mathApiContract.unavailableResponse.safeParse(mathOriginResponse.json()).success,
    true
  );
  assert.equal(mathOriginResponse.json().resource, "submission");
});

test("math routes reject padded params before returning readiness responses", async (t) => {
  const app = Fastify();

  t.after(async () => {
    await app.close();
  });

  registerMathRoutes(
    app,
    fakeDb,
    createAccessGuard({
      role: "helper",
      status: "approved",
      userId: "user-helper"
    }) as never
  );

  const response = await app.inject({
    method: "GET",
    url: "/math/questions/%20problem-9%20"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_math_question_params");
});

test("buildServer registers math routes on the authenticated surface", async (t) => {
  const app = await buildServer(
    parseApiRuntimeEnv({
      ACCESS_PROVIDER_STATE_SECRET: "runtime-secret",
      AUTH_PUBLIC_ORIGIN: "https://auth.preview.paretoproof.com",
      CF_ACCESS_BRANDED_AUDS: "github-audience,google-audience",
      CF_ACCESS_PORTAL_AUD: "portal-audience",
      CF_ACCESS_TEAM_DOMAIN: "paretoproof.cloudflareaccess.com",
      DATABASE_URL: "postgres://localhost:5432/paretoproof",
      MATH_PUBLIC_ORIGIN: "https://math.preview.paretoproof.com",
      PORTAL_PUBLIC_ORIGIN: "https://portal.preview.paretoproof.com",
      WORKER_BOOTSTRAP_TOKEN: "worker-bootstrap-token"
    }),
    {
      createDbClient: () =>
        ({
          execute: async () => {}
        }) as never
    }
  );

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/math/questions"
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: "access_assertion_required"
  });
});
