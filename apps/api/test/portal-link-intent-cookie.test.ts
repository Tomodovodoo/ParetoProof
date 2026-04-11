import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerPortalRoutes } from "../src/routes/portal.ts";

function createApprovedAccessGuard() {
  return () =>
    (
      request: {
        accessIdentity?: unknown;
        accessRbacContext?: unknown;
      },
      _reply: unknown,
      done: () => void,
    ) => {
      request.accessIdentity = {
        email: "person@example.com",
        issuer: "https://paretoproof.cloudflareaccess.com",
        provider: "cloudflare_google",
        subject: "subject-1",
      };
      request.accessRbacContext = {
        email: "person@example.com",
        identityId: "identity-1",
        roles: ["helper"],
        status: "approved",
        subject: "subject-1",
        userId: "user-1",
      };
      done();
    };
}

test("POST /portal/profile/link-intents issues a Strict PortalLinkIntent cookie for profile linking", async (t) => {
  const app = Fastify();
  const originalSecret = process.env.ACCESS_PROVIDER_STATE_SECRET;
  process.env.ACCESS_PROVIDER_STATE_SECRET = "test-secret";

  t.after(async () => {
    process.env.ACCESS_PROVIDER_STATE_SECRET = originalSecret;
    await app.close();
  });

  const insertedAuditEvents: Array<{ eventId?: string }> = [];
  const db = {
    query: {
      userIdentities: {
        findFirst: async () => ({
          provider: "cloudflare_google",
          providerSubject: "subject-1",
          user: {
            id: "user-1",
            identities: [
              {
                provider: "cloudflare_google",
              },
            ],
          },
        }),
      },
    },
    transaction: async (
      callback: (tx: {
        insert: () => {
          values: (value: unknown) => {
            returning?: () => Promise<
              Array<{
                expiresAt: Date;
                id: string;
                redirectPath: string;
                targetProvider: "cloudflare_github";
              }>
            >;
          };
        };
        update: () => {
          set: () => {
            where: () => Promise<void>;
          };
        };
      }) => Promise<unknown>,
    ) =>
      callback({
        insert() {
          return {
            values(value: unknown) {
              const record = value as { targetProvider?: string };

              if (record.targetProvider) {
                return {
                  returning: async () => [
                    {
                      expiresAt: new Date("2026-03-15T11:00:00.000Z"),
                      id: "intent-1",
                      redirectPath: "/profile?tab=identities",
                      targetProvider: "cloudflare_github",
                    },
                  ],
                };
              }

              insertedAuditEvents.push(value as { eventId?: string });
              return {};
            },
          };
        },
        update() {
          return {
            set() {
              return {
                where: async () => undefined,
              };
            },
          };
        },
      } as never),
  };

  registerPortalRoutes(app, db as never, createApprovedAccessGuard() as never, {
    accessCookieDomain: ".preview.paretoproof.com",
    accessCookieSecure: false,
    authPublicOrigin: "https://auth.preview.paretoproof.com",
    resolvePortalAccess: async () => null,
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      provider: "cloudflare_github",
      redirectPath: "/profile?tab=identities",
    },
    url: "/portal/profile/link-intents",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.json().intent.startUrl,
    "https://auth.preview.paretoproof.com/api/access/start/github?redirect=%2Fprofile%3Ftab%3Didentities&flow=link",
  );
  assert.equal(
    insertedAuditEvents[0]?.eventId,
    "user_identity.link_intent_created",
  );

  const setCookie = response.headers["set-cookie"];
  const setCookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  assert.equal(setCookies.length, 1);
  assert.match(String(setCookies[0]), /^PortalLinkIntent=/);
  assert.match(String(setCookies[0]), /Domain=.preview.paretoproof.com/);
  assert.match(String(setCookies[0]), /; SameSite=Strict;/);
  assert.doesNotMatch(String(setCookies[0]), /; Secure;/);
});
