import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler
} from "fastify";

export type ApiRateLimitPolicyId = "public" | "authenticated";

type ApiRateLimitPolicy = {
  id: ApiRateLimitPolicyId;
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type ApiRateLimitOptions = {
  cleanupIntervalMs?: number;
  maxTrackedKeys?: number;
  now?: () => number;
  policies?: Partial<Record<ApiRateLimitPolicyId, Partial<Omit<ApiRateLimitPolicy, "id">>>>;
};

const defaultPolicies: Record<ApiRateLimitPolicyId, ApiRateLimitPolicy> = {
  authenticated: {
    id: "authenticated",
    limit: 300,
    windowMs: 60_000
  },
  public: {
    id: "public",
    limit: 60,
    windowMs: 60_000
  }
};

const defaultCleanupIntervalMs = 30_000;
const defaultMaxTrackedKeys = 10_000;

function readTrustedClientIp(request: FastifyRequest) {
  return typeof request.ip === "string" && request.ip.trim().length > 0
    ? request.ip.trim()
    : "unknown";
}

function getRateLimitKey(request: FastifyRequest, policyId: ApiRateLimitPolicyId) {
  if (policyId === "authenticated") {
    const accessContext = request.accessRbacContext;

    if (
      accessContext &&
      "userId" in accessContext &&
      typeof accessContext.userId === "string"
    ) {
      return `user:${accessContext.userId}`;
    }

    if (request.accessIdentity?.subject) {
      return `subject:${request.accessIdentity.subject}`;
    }
  }

  return `ip:${readTrustedClientIp(request)}`;
}

export function applyRateLimitHeaders(
  reply: FastifyReply,
  decision: RateLimitDecision,
  includeRetryAfter = false
) {
  reply.header("X-RateLimit-Limit", String(decision.limit));
  reply.header("X-RateLimit-Remaining", String(decision.remaining));
  reply.header("X-RateLimit-Reset", String(Math.ceil(decision.resetAt / 1000)));

  if (includeRetryAfter) {
    reply.header("Retry-After", String(decision.retryAfterSeconds));
  }
}

export function createInMemoryRateLimiter(options: ApiRateLimitOptions = {}) {
  const now = options.now ?? Date.now;
  const cleanupIntervalMs = Math.max(1, options.cleanupIntervalMs ?? defaultCleanupIntervalMs);
  const maxTrackedKeys = Math.max(1, options.maxTrackedKeys ?? defaultMaxTrackedKeys);
  const policies = {
    authenticated: {
      ...defaultPolicies.authenticated,
      ...options.policies?.authenticated
    },
    public: {
      ...defaultPolicies.public,
      ...options.policies?.public
    }
  } satisfies Record<ApiRateLimitPolicyId, ApiRateLimitPolicy>;
  const stateByKey = new Map<string, RateLimitState>();
  let lastCleanupAt = 0;

  function cleanupExpiredEntries(currentTime: number) {
    if (currentTime - lastCleanupAt < cleanupIntervalMs && stateByKey.size < maxTrackedKeys) {
      return;
    }

    for (const [key, state] of stateByKey.entries()) {
      if (state.resetAt <= currentTime) {
        stateByKey.delete(key);
      }
    }

    lastCleanupAt = currentTime;
  }

  function resolveTrackedKey(
    policyId: ApiRateLimitPolicyId,
    request: FastifyRequest,
    currentTime: number
  ) {
    cleanupExpiredEntries(currentTime);

    const rawKey = `${policyId}:${getRateLimitKey(request, policyId)}`;

    if (stateByKey.has(rawKey) || stateByKey.size < maxTrackedKeys) {
      return rawKey;
    }

    const overflowKey = `${policyId}:overflow`;

    if (stateByKey.has(overflowKey)) {
      return overflowKey;
    }

    while (stateByKey.size >= maxTrackedKeys) {
      const oldestTrackedKey = stateByKey.keys().next().value;

      if (typeof oldestTrackedKey !== "string") {
        break;
      }

      stateByKey.delete(oldestTrackedKey);
    }

    return overflowKey;
  }

  return {
    check(policyId: ApiRateLimitPolicyId, request: FastifyRequest) {
      const policy = policies[policyId];
      const currentTime = now();
      const key = resolveTrackedKey(policy.id, request, currentTime);
      const previousState = stateByKey.get(key);
      const state =
        previousState && previousState.resetAt > currentTime
          ? previousState
          : {
              count: 0,
              resetAt: currentTime + policy.windowMs
            };

      if (state.count >= policy.limit) {
        const decision = {
          limit: policy.limit,
          remaining: 0,
          resetAt: state.resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - currentTime) / 1000))
        } satisfies RateLimitDecision;

        stateByKey.set(key, state);

        return {
          allowed: false as const,
          decision
        };
      }

      state.count += 1;
      stateByKey.set(key, state);

      return {
        allowed: true as const,
        decision: {
          limit: policy.limit,
          remaining: Math.max(policy.limit - state.count, 0),
          resetAt: state.resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - currentTime) / 1000))
        } satisfies RateLimitDecision
      };
    },
    getTrackedKeyCount() {
      return stateByKey.size;
    }
  };
}

export function createRateLimitPreHandlers(
  rateLimiter: ReturnType<typeof createInMemoryRateLimiter>
): Record<ApiRateLimitPolicyId, preHandlerHookHandler> {
  return {
    authenticated: (request, reply, done) => {
      const result = rateLimiter.check("authenticated", request);
      applyRateLimitHeaders(reply, result.decision, !result.allowed);

      if (!result.allowed) {
        reply.code(429).send({
          error: "rate_limit_exceeded",
          retryAfterSeconds: result.decision.retryAfterSeconds,
          scope: "authenticated"
        });
        return;
      }

      done();
    },
    public: (request, reply, done) => {
      const result = rateLimiter.check("public", request);
      applyRateLimitHeaders(reply, result.decision, !result.allowed);

      if (!result.allowed) {
        reply.code(429).send({
          error: "rate_limit_exceeded",
          retryAfterSeconds: result.decision.retryAfterSeconds,
          scope: "public"
        });
        return;
      }

      done();
    }
  };
}
