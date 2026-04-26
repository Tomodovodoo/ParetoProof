import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiRateLimitError,
  authenticatedAuthExpiredEventName,
  fetchApi,
  portalAuthExpiredEventName
} from "./api-fetch.ts";

test("fetchApi retries one safe request after Retry-After and eventually succeeds", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const observedWaits = [];
  let callCount = 0;

  globalThis.window = {
    location: {
      origin: "https://portal.paretoproof.com"
    },
    setTimeout(callback, delay) {
      observedWaits.push(delay);
      callback();
      return 0;
    }
  };
  globalThis.fetch = async () => {
    callCount += 1;

    if (callCount === 1) {
      return new Response(null, {
        headers: {
          "Retry-After": "1"
        },
        status: 429
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  };

  try {
    const response = await fetchApi("https://api.paretoproof.com/portal/me");

    assert.equal(response.status, 200);
    assert.equal(callCount, 2);
    assert.deepEqual(observedWaits, [1000, 1000]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("fetchApi throws ApiRateLimitError for non-idempotent requests after reading retry headers", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  globalThis.window = {
    location: {
      origin: "https://portal.paretoproof.com"
    },
    setTimeout(callback) {
      callback();
      return 0;
    }
  };
  globalThis.fetch = async () =>
    new Response(null, {
      headers: {
        "Retry-After": "2"
      },
      status: 429
    });

  try {
    await assert.rejects(
      () =>
        fetchApi("https://api.paretoproof.com/portal/profile", {
          body: "displayName=Test",
          method: "POST"
        }),
      (error) => {
        assert.equal(error instanceof ApiRateLimitError, true);
        assert.equal(error.retryAfterMs, 2000);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("fetchApi emits authenticated and legacy portal auth-expired events for 401 portal responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const observedEvents = [];

  globalThis.window = {
    dispatchEvent(event) {
      observedEvents.push(event.type);
      return true;
    },
    location: {
      origin: "https://portal.paretoproof.com"
    },
    setTimeout(callback) {
      callback();
      return 0;
    }
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "access_assertion_required" }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 401
    });

  try {
    const response = await fetchApi("https://api.paretoproof.com/portal/admin/access-requests");

    assert.equal(response.status, 401);
    assert.deepEqual(observedEvents, [
      authenticatedAuthExpiredEventName,
      portalAuthExpiredEventName
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("fetchApi emits the authenticated auth-expired event for 401 math responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const observedEvents = [];

  globalThis.window = {
    dispatchEvent(event) {
      observedEvents.push(event.type);
      return true;
    },
    location: {
      origin: "https://math.paretoproof.com"
    },
    setTimeout(callback) {
      callback();
      return 0;
    }
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "access_assertion_required" }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 401
    });

  try {
    const response = await fetchApi("https://api.paretoproof.com/math/submissions");

    assert.equal(response.status, 401);
    assert.deepEqual(observedEvents, [authenticatedAuthExpiredEventName]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("fetchApi does not emit an authenticated auth-expired event for public 401 responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const observedEvents = [];

  globalThis.window = {
    dispatchEvent(event) {
      observedEvents.push(event.type);
      return true;
    },
    location: {
      origin: "https://portal.paretoproof.com"
    },
    setTimeout(callback) {
      callback();
      return 0;
    }
  };
  globalThis.fetch = async () => new Response(null, { status: 401 });

  try {
    const response = await fetchApi("https://api.paretoproof.com/health");

    assert.equal(response.status, 401);
    assert.deepEqual(observedEvents, []);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
