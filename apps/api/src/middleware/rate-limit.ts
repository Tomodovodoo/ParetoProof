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

function readClientIp(request: FastifyRequest) {
  const cfConnectingIp =
    typeof request.headers["cf-connecting-ip"] === "string"
      ? request.headers["cf-connecting-ip"].trim()
      : "";

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor =
    typeof request.headers["x-forwarded-for"] === "string"
      ? request.headers["x-forwarded-for"]
      : "";
  const forwardedIp = forwardedFor.split(",")[0]?.trim() ?? "";

  if (forwardedIp) {
    return forwardedIp;
  }

  return request.ip;
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

  return `ip:${readClientIp(request)}`;
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

  return {
    check(policyId: ApiRateLimitPolicyId, request: FastifyRequest) {
      const policy = policies[policyId];
      const key = `${policy.id}:${getRateLimitKey(request, policyId)}`;
      const currentTime = now();
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
