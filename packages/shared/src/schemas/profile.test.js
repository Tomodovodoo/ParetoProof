import { describe, expect, it } from "bun:test";
import {
  portalMeResponseSchema,
  portalProfileLinkIntentResponseSchema,
  portalProfileResponseSchema,
  portalSessionFinalizeResponseSchema
} from "./profile.js";

describe("portal profile and bootstrap response schemas", () => {
  it("accepts approved bootstrap responses with provider and RBAC details", () => {
    const parsed = portalMeResponseSchema.safeParse({
      access: {
        email: "helper@example.com",
        role: "helper",
        status: "approved",
        userId: "usr_123"
      },
      identity: {
        provider: "cloudflare_github",
        subject: "github|123"
      }
    });

    expect(parsed.success).toBeTrue();

    if (!parsed.success) {
      return;
    }

    expect(parsed.data.access.role).toBe("helper");
    expect(parsed.data.access.userId).toBe("usr_123");
    expect(parsed.data.identity?.provider).toBe("cloudflare_github");
  });

  it("accepts providerless recovery bootstrap responses", () => {
    expect(
      portalMeResponseSchema.safeParse({
        access: {
          email: "helper@example.com",
          reason: "identity_recovery_required",
          status: "denied"
        },
        identity: {
          provider: null
        }
      }).success
    ).toBeTrue();
  });

  it("rejects malformed bootstrap envelopes", () => {
    expect(
      portalMeResponseSchema.safeParse({
        access: {
          email: "helper@example.com",
          status: "approved"
        },
        identity: {
          provider: "github"
        }
      }).success
    ).toBeFalse();

    expect(
      portalMeResponseSchema.safeParse({
        access: {
          email: "helper@example.com",
          state: "approved"
        },
        identity: null
      }).success
    ).toBeFalse();

    expect(
      portalMeResponseSchema.safeParse({
        access: {
          email: "helper@example.com",
          status: "approved"
        },
        identity: {
          provider: "cloudflare_github"
        }
      }).success
    ).toBeFalse();

    expect(
      portalMeResponseSchema.safeParse({
        access: {
          email: "helper@example.com",
          status: "denied"
        },
        identity: null
      }).success
    ).toBeFalse();
  });

  it("models session finalize redirects as absolute URLs", () => {
    expect(
      portalSessionFinalizeResponseSchema.safeParse({
        redirectTo: "https://portal.paretoproof.com/profile"
      }).success
    ).toBeTrue();

    expect(
      portalSessionFinalizeResponseSchema.safeParse({
        redirectTo: "/profile"
      }).success
    ).toBeFalse();
  });

  it("models profile and link-intent response envelopes", () => {
    expect(
      portalProfileResponseSchema.safeParse({
        profile: {
          createdAt: "2026-04-26T00:00:00.000Z",
          displayName: "Ada",
          email: "ada@example.com",
          identities: [],
          linkedUserId: "11111111-1111-4111-8111-111111111111",
          updatedAt: "2026-04-26T00:00:00.000Z"
        }
      }).success
    ).toBeTrue();

    expect(
      portalProfileLinkIntentResponseSchema.safeParse({
        intent: {
          expiresAt: "2026-04-26T00:10:00.000Z",
          provider: "cloudflare_google",
          startUrl: "https://auth.paretoproof.com/api/access/start/google"
        }
      }).success
    ).toBeTrue();
  });
});
