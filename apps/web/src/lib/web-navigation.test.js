import { describe, expect, it } from "bun:test";
import {
  isInterceptablePublicNavigation,
  navigateWithinPublicSurface
} from "./web-navigation.ts";

function withWindow(locationHref, run) {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: new URL(locationHref)
  };

  try {
    return run();
  } finally {
    globalThis.window = originalWindow;
  }
}

describe("isInterceptablePublicNavigation", () => {
  it("allows same-origin public route changes", () => {
    withWindow("https://paretoproof.com/", () => {
      expect(
        isInterceptablePublicNavigation({
          currentHref: "https://paretoproof.com/",
          currentSurface: "public",
          nextHref: "https://paretoproof.com/project"
        })
      ).toBe(true);
    });
  });

  it("does not intercept auth or portal transitions", () => {
    withWindow("https://paretoproof.com/", () => {
      expect(
        isInterceptablePublicNavigation({
          currentHref: "https://paretoproof.com/",
          currentSurface: "public",
          nextHref: "https://auth.paretoproof.com/"
        })
      ).toBe(false);

      expect(
        isInterceptablePublicNavigation({
          currentHref: "https://paretoproof.com/",
          currentSurface: "public",
          nextHref: "https://portal.paretoproof.com/"
        })
      ).toBe(false);
    });
  });

  it("does not intercept localhost auth or portal surface links", () => {
    withWindow("http://127.0.0.1:4175/", () => {
      expect(
        isInterceptablePublicNavigation({
          currentHref: "http://127.0.0.1:4175/",
          currentSurface: "public",
          nextHref: "http://127.0.0.1:4175/?surface=auth"
        })
      ).toBe(false);

      expect(
        isInterceptablePublicNavigation({
          currentHref: "http://127.0.0.1:4175/",
          currentSurface: "public",
          nextHref: "http://127.0.0.1:4175/?surface=portal&access=approved"
        })
      ).toBe(false);
    });
  });

  it("does not intercept external or same-path clicks", () => {
    withWindow("https://paretoproof.com/", () => {
      expect(
        isInterceptablePublicNavigation({
          currentHref: "https://paretoproof.com/",
          currentSurface: "public",
          nextHref: "https://github.com/Tomodovodoo/ParetoProof"
        })
      ).toBe(false);
    });

    withWindow("https://paretoproof.com/project", () => {
      expect(
        isInterceptablePublicNavigation({
          currentHref: "https://paretoproof.com/project",
          currentSurface: "public",
          nextHref: "https://paretoproof.com/project"
        })
      ).toBe(false);
    });
  });
});

describe("navigateWithinPublicSurface", () => {
  it("pushes history, scrolls to top, and dispatches a navigation event for same-surface routes", () => {
    const originalWindow = globalThis.window;
    const dispatchedEvents = [];
    const pushStateCalls = [];
    const scrollCalls = [];

    globalThis.window = {
      dispatchEvent(event) {
        dispatchedEvents.push(event.type);
        return true;
      },
      history: {
        pushState(_state, _title, nextUrl) {
          pushStateCalls.push(String(nextUrl));
        }
      },
      location: new URL("https://paretoproof.com/"),
      scrollTo(options) {
        scrollCalls.push(options);
      }
    };

    try {
      expect(navigateWithinPublicSurface("https://paretoproof.com/benchmarks")).toBe(true);
      expect(pushStateCalls).toEqual(["https://paretoproof.com/benchmarks"]);
      expect(scrollCalls).toEqual([{ left: 0, top: 0 }]);
      expect(dispatchedEvents).toEqual(["paretoproof:navigation"]);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("preserves anchor jumps for same-surface public links with hashes", () => {
    const originalDocument = globalThis.document;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalWindow = globalThis.window;
    const target = { scrollIntoViewCalls: 0, scrollIntoView() { this.scrollIntoViewCalls += 1; } };

    globalThis.document = {
      querySelector(selector) {
        return selector === "#contributors" ? target : null;
      }
    };
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 0;
    };
    globalThis.window = {
      dispatchEvent() {
        return true;
      },
      history: {
        pushState() {}
      },
      location: new URL("https://paretoproof.com/"),
      scrollTo() {
        throw new Error("Expected hash navigation to avoid top-level scroll reset");
      }
    };

    try {
      expect(
        navigateWithinPublicSurface("https://paretoproof.com/project#contributors")
      ).toBe(true);
      expect(target.scrollIntoViewCalls).toBe(1);
    } finally {
      globalThis.document = originalDocument;
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.window = originalWindow;
    }
  });

  it("skips transitions that should stay as normal browser navigations", () => {
    const originalWindow = globalThis.window;
    const pushStateCalls = [];

    globalThis.window = {
      dispatchEvent() {
        return true;
      },
      history: {
        pushState(_state, _title, nextUrl) {
          pushStateCalls.push(String(nextUrl));
        }
      },
      location: new URL("https://paretoproof.com/"),
      scrollTo() {}
    };

    try {
      expect(navigateWithinPublicSurface("https://auth.paretoproof.com/")).toBe(false);
      expect(pushStateCalls).toEqual([]);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
