import { describe, expect, it } from "bun:test";
import {
  buildApprovedAuthHandoffCookieMutation,
  buildApprovedAuthHandoffCookieValue,
  buildClearApprovedAuthHandoffCookieMutation,
  consumeApprovedAuthHandoffCookie,
  readApprovedAuthHandoffCookie
} from "./approved-auth-handoff.ts";

describe("approved auth handoff cookies", () => {
  it("round-trips a fresh portal handoff cookie", () => {
    const cookieHeader = buildApprovedAuthHandoffCookieValue(
      {
        role: "admin",
        status: "approved",
        surface: "portal"
      },
      10_000
    );

    expect(
      readApprovedAuthHandoffCookie(cookieHeader, {
        nowMs: 20_000,
        surface: "portal"
      })
    ).toEqual({
      role: "admin",
      status: "approved",
      surface: "portal"
    });
  });

  it("ignores expired handoff cookies", () => {
    const cookieHeader = buildApprovedAuthHandoffCookieValue(
      {
        role: "collaborator",
        status: "approved",
        surface: "portal"
      },
      10_000
    );

    expect(
      readApprovedAuthHandoffCookie(cookieHeader, {
        nowMs: 50_001,
        surface: "portal"
      })
    ).toBeNull();
  });

  it("ignores cookies meant for a different authenticated surface", () => {
    const cookieHeader = buildApprovedAuthHandoffCookieValue(
      {
        role: "admin",
        status: "approved",
        surface: "math"
      },
      10_000
    );

    expect(
      readApprovedAuthHandoffCookie(cookieHeader, {
        nowMs: 20_000,
        surface: "portal"
      })
    ).toBeNull();
  });

  it("uses a shared paretoproof.com domain for hosted auth handoffs", () => {
    expect(
      buildApprovedAuthHandoffCookieMutation(
        {
          role: "admin",
          status: "approved",
          surface: "portal"
        },
        {
          hostname: "auth.paretoproof.com",
          protocol: "https:"
        },
        10_000
      )
    ).toContain("Domain=.paretoproof.com");
  });

  it("keeps local preview handoffs host-only", () => {
    expect(
      buildApprovedAuthHandoffCookieMutation(
        {
          role: "admin",
          status: "approved",
          surface: "portal"
        },
        {
          hostname: "127.0.0.1",
          protocol: "http:"
        },
        10_000
      )
    ).not.toContain("Domain=");
  });

  it("consumes and clears the cookie in one hop", () => {
    const cookieStore = {
      cookie: buildApprovedAuthHandoffCookieValue(
        {
          role: "helper",
          status: "approved",
          surface: "portal"
        },
        10_000
      )
    };

    expect(
      consumeApprovedAuthHandoffCookie({
        documentLike: cookieStore,
        locationLike: {
          hostname: "portal.paretoproof.com",
          protocol: "https:"
        },
        nowMs: 20_000,
        surface: "portal"
      })
    ).toEqual({
      role: "helper",
      status: "approved",
      surface: "portal"
    });
    expect(cookieStore.cookie).toBe(
      buildClearApprovedAuthHandoffCookieMutation({
        hostname: "portal.paretoproof.com",
        protocol: "https:"
      })
    );
  });
});
