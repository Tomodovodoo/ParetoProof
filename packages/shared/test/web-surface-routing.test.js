import { describe, expect, it } from "bun:test";
import {
  isLocalDevelopmentLocation,
  isTrustedFinalizeRelayLocation,
  resolveAccessProviderFromHost,
  resolveAuthenticatedRouteTarget,
  resolveFinalizedAuthenticatedRedirectTarget,
  resolveWebSurfaceFromLocation,
  sanitizeAuthenticatedRedirectTarget
} from "../dist/index.js";

describe("web surface routing policy", () => {
  it("classifies hosted and local development surfaces without browser globals", () => {
    expect(resolveWebSurfaceFromLocation({ hostname: "paretoproof.com" })).toBe("public");
    expect(resolveWebSurfaceFromLocation({ hostname: "auth.paretoproof.com" })).toBe("auth");
    expect(resolveWebSurfaceFromLocation({ hostname: "portal.paretoproof.com" })).toBe("portal");
    expect(resolveWebSurfaceFromLocation({ hostname: "math.paretoproof.com" })).toBe("math");
    expect(
      resolveWebSurfaceFromLocation({
        hostname: "paretoproof.com",
        port: "4173",
        protocol: "http:",
        search: "?surface=math"
      })
    ).toBe("math");
  });

  it("recognizes provider auth hosts separately from the shared auth entry", () => {
    expect(resolveAccessProviderFromHost("github.auth.paretoproof.com")).toBe("github");
    expect(resolveAccessProviderFromHost("google.auth.paretoproof.com")).toBe("google");
    expect(resolveAccessProviderFromHost("auth.paretoproof.com")).toBeNull();
    expect(resolveAccessProviderFromHost("paretoproof.com")).toBeNull();
  });

  it("requires explicit local development signals for branded http hosts", () => {
    expect(
      isLocalDevelopmentLocation({
        hostname: "localhost",
        protocol: "http:"
      })
    ).toBe(true);
    expect(
      isLocalDevelopmentLocation({
        hostname: "auth.paretoproof.com",
        port: "4173",
        protocol: "http:"
      })
    ).toBe(true);
    expect(
      isLocalDevelopmentLocation({
        hostname: "auth.paretoproof.com",
        protocol: "http:"
      })
    ).toBe(false);
    expect(
      isLocalDevelopmentLocation({
        hostname: "auth.paretoproof.com",
        protocol: "https:"
      })
    ).toBe(false);
  });

  it("accepts only trusted hosted or local finalize relay locations", () => {
    expect(
      isTrustedFinalizeRelayLocation({
        hostname: "github.auth.paretoproof.com",
        protocol: "https:"
      })
    ).toBe(true);
    expect(
      isTrustedFinalizeRelayLocation({
        hostname: "github.auth.paretoproof.com",
        port: "4173",
        protocol: "http:"
      })
    ).toBe(true);
    expect(
      isTrustedFinalizeRelayLocation({
        hostname: "localhost",
        protocol: "http:"
      })
    ).toBe(true);
    expect(
      isTrustedFinalizeRelayLocation({
        hostname: "github.auth.paretoproof.com",
        protocol: "http:"
      })
    ).toBe(false);
    expect(
      isTrustedFinalizeRelayLocation({
        hostname: "portal.paretoproof.com",
        protocol: "https:"
      })
    ).toBe(false);
  });

  it("normalizes authenticated route targets by owned surface", () => {
    expect(
      resolveAuthenticatedRouteTarget("/questions/problem-9?tab=review#proof", {
        surface: "math"
      })
    ).toEqual({
      surface: "math",
      targetPath: "/questions/problem-9?tab=review#proof"
    });
    expect(
      resolveAuthenticatedRouteTarget("https://portal.paretoproof.com/profile", {
        allowAbsolute: true
      })
    ).toEqual({
      surface: "portal",
      targetPath: "/profile"
    });
    expect(
      resolveAuthenticatedRouteTarget("/project", {
        surface: "portal"
      })
    ).toBeNull();
    expect(
      resolveAuthenticatedRouteTarget("/profile", {
        surface: "math"
      })
    ).toBeNull();
  });

  it("sanitizes request-supplied redirects without allowing absolute handoffs", () => {
    expect(
      sanitizeAuthenticatedRedirectTarget("/profile?tab=identity#linked", {
        allowAbsolute: false,
        surface: "portal"
      })
    ).toBe("/profile?tab=identity#linked");
    expect(
      sanitizeAuthenticatedRedirectTarget("https://portal.paretoproof.com/profile", {
        allowAbsolute: false,
        surface: "portal"
      })
    ).toBe("/");
    expect(
      sanitizeAuthenticatedRedirectTarget("//portal.paretoproof.com/profile", {
        allowAbsolute: false,
        surface: "portal"
      })
    ).toBe("/");
    expect(
      sanitizeAuthenticatedRedirectTarget("javascript:alert(1)", {
        allowAbsolute: false,
        surface: "portal"
      })
    ).toBe("/");
    expect(
      sanitizeAuthenticatedRedirectTarget("/project", {
        allowAbsolute: false,
        surface: "portal"
      })
    ).toBe("/");
  });

  it("accepts only finalized redirects to owned authenticated hosts and routes", () => {
    expect(
      resolveFinalizedAuthenticatedRedirectTarget(
        "https://portal.paretoproof.com/profile?tab=identity#linked",
        {
          fallbackRedirectPath: "/",
          fallbackSurface: "portal"
        }
      )
    ).toBe("https://portal.paretoproof.com/profile?tab=identity#linked");
    expect(
      resolveFinalizedAuthenticatedRedirectTarget(undefined, {
        fallbackRedirectPath: "/launch",
        fallbackSurface: "math"
      })
    ).toBe("https://math.paretoproof.com/launch");
    expect(
      resolveFinalizedAuthenticatedRedirectTarget(undefined, {
        fallbackRedirectPath: "/profile",
        fallbackSurface: "math"
      })
    ).toBe("https://math.paretoproof.com/");
    expect(
      resolveFinalizedAuthenticatedRedirectTarget("https://auth.paretoproof.com/", {
        fallbackRedirectPath: "/profile",
        fallbackSurface: "portal"
      })
    ).toBeNull();
    expect(
      resolveFinalizedAuthenticatedRedirectTarget("https://paretoproof.com/project", {
        fallbackRedirectPath: "/profile",
        fallbackSurface: "portal"
      })
    ).toBeNull();
    expect(
      resolveFinalizedAuthenticatedRedirectTarget("https://math.paretoproof.com/profile", {
        fallbackRedirectPath: "/launch",
        fallbackSurface: "math"
      })
    ).toBeNull();
  });
});
