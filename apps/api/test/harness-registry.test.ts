import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  portalHarnessRegistryReadContract,
  type HarnessRegistryCatalog
} from "@paretoproof/shared";
import { registerPortalRoutes } from "../src/routes/portal.ts";

function createRequireAccessStub(roles: Array<"admin" | "collaborator" | "helper">) {
  return (requiredAccess: string) =>
    (
      request: Record<string, unknown>,
      reply: {
        code: (statusCode: number) => { send: (payload: unknown) => void };
        send: (payload: unknown) => void;
      },
      done: () => void
    ) => {
      request.accessIdentity = {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_google",
        subject: "subject-1"
      };
      request.accessRbacContext = {
        email: "person@example.com",
        identityId: "identity-1",
        roles,
        status: "approved",
        subject: "subject-1",
        userId: "user-1"
      };

      const allow =
        requiredAccess === "authenticated_access_identity" ||
        (requiredAccess === "approved_helper_or_higher" && roles.length > 0) ||
        (requiredAccess === "approved_collaborator_or_higher" &&
          (roles.includes("collaborator") || roles.includes("admin"))) ||
        (requiredAccess === "admin_only" && roles.includes("admin"));

      if (!allow) {
        reply.code(403).send({
          error: "forbidden"
        });
        return;
      }

      done();
    };
}

test("GET /portal/harnesses returns a contract-valid harness catalog for approved helpers", async (t) => {
  const app = Fastify();
  registerPortalRoutes(app, {} as never, createRequireAccessStub(["helper"]) as never, {
    resolvePortalAccess: async () => null
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/portal/harnesses"
  });

  assert.equal(response.statusCode, 200);

  const payload = portalHarnessRegistryReadContract.catalogResponse.parse(
    response.json()
  ) as HarnessRegistryCatalog;

  assert.equal(payload.version, 1);
  assert.deepEqual(
    payload.items.map((entry) => entry.id),
    ["problem9_hosted", "problem9_trusted_local_devbox"]
  );
  assert.deepEqual(payload.items[0].imageRefs.map((imageRef) => imageRef.role), [
    "hosted_worker_image",
    "execution_image"
  ]);
  assert.equal(payload.items[0].runtimeClass, "hosted_worker");
});

test("GET /portal/harnesses requires approved helper access", async (t) => {
  const app = Fastify();
  registerPortalRoutes(app, {} as never, createRequireAccessStub([]) as never, {
    resolvePortalAccess: async () => null
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/portal/harnesses"
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "forbidden"
  });
});
