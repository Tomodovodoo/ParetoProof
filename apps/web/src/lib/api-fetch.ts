const rateLimitBackoffByOrigin = new Map<string, number>();
export const portalAuthExpiredEventName = "paretoproof:portal-auth-expired";

export class ApiRateLimitError extends Error {
  response: Response;
  retryAfterMs: number;

  constructor(message: string, response: Response, retryAfterMs: number) {
    super(message);
    this.name = "ApiRateLimitError";
    this.response = response;
    this.retryAfterMs = retryAfterMs;
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readRetryAfterMs(response: Response) {
  const retryAfterHeader = response.headers.get("Retry-After");

  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }

    const retryAfterDate = Date.parse(retryAfterHeader);

    if (Number.isFinite(retryAfterDate)) {
      return Math.max(retryAfterDate - Date.now(), 0);
    }
  }

  const resetHeader = response.headers.get("X-RateLimit-Reset");

  if (!resetHeader) {
    return 1000;
  }

  const resetSeconds = Number(resetHeader);

  if (!Number.isFinite(resetSeconds)) {
    return 1000;
  }

  return Math.max(resetSeconds * 1000 - Date.now(), 1000);
}

function resolveRequestUrl(input: RequestInfo | URL) {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  return new URL(requestUrl, window.location.origin);
}

function getBackoffOrigin(input: RequestInfo | URL) {
  return resolveRequestUrl(input).origin;
}

function shouldAutoRetry(init: RequestInit | undefined) {
  const method = (init?.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD";
}

function usesAuthenticatedApiSession(pathname: string) {
  return pathname.startsWith("/portal/") || pathname.startsWith("/math/");
}

function signalPortalAuthExpired(requestUrl: URL, response: Response) {
  if (response.status !== 401 || !usesAuthenticatedApiSession(requestUrl.pathname)) {
    return;
  }

  if (typeof window.dispatchEvent !== "function" || typeof Event !== "function") {
    return;
  }

  window.dispatchEvent(new Event(portalAuthExpiredEventName));
}

export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const backoffOrigin = getBackoffOrigin(input);
  const requestUrl = resolveRequestUrl(input);
  const autoRetry = shouldAutoRetry(init);
  let attemptCount = 0;

  while (true) {
    const nextAllowedAt = rateLimitBackoffByOrigin.get(backoffOrigin) ?? 0;
    const waitMs = nextAllowedAt - Date.now();

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const response = await fetch(input, init);

    if (response.status !== 429) {
      signalPortalAuthExpired(requestUrl, response);
      return response;
    }

    const retryAfterMs = Math.min(readRetryAfterMs(response), 30_000);
    rateLimitBackoffByOrigin.set(backoffOrigin, Date.now() + retryAfterMs);

    if (autoRetry && attemptCount < 1) {
      attemptCount += 1;
      await sleep(retryAfterMs);
      continue;
    }

    throw new ApiRateLimitError(
      `The API is rate limiting this browser. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
      response,
      retryAfterMs
    );
  }
}
