import { mathApiContract, mathLeanSubmissionContract } from "@paretoproof/shared";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler
} from "fastify";
import {
  createMathApiServiceBoundary,
  type MathApiServiceBoundary
} from "../lib/math-api-services.js";
import type { createRateLimitPreHandlers } from "../middleware/rate-limit.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type SafeParseSchema<T> = {
  safeParse: (value: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: unknown[] } };
};

function sendUnavailable(reply: FastifyReply, payload: unknown) {
  reply.code(501).send(payload);
}

function parseParams<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  schema: SafeParseSchema<T>,
  error: string
): T | null {
  const parsedParams = schema.safeParse(request.params ?? {});

  if (!parsedParams.success) {
    reply.code(400).send({
      error,
      issues: parsedParams.error.issues
    });
    return null;
  }

  return parsedParams.data;
}

function parseBody<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  schema: SafeParseSchema<T>,
  error: string
): T | null {
  const parsedBody = schema.safeParse(request.body ?? {});

  if (!parsedBody.success) {
    reply.code(400).send({
      error,
      issues: parsedBody.error.issues
    });
    return null;
  }

  return parsedBody.data;
}

export function registerMathRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  requireAccess: ReturnTypeOfCreateAccessGuard,
  options?: {
    mathServices?: MathApiServiceBoundary;
    rateLimitPreHandlers?: ReturnType<typeof createRateLimitPreHandlers>;
  }
) {
  const mathServices = options?.mathServices ?? createMathApiServiceBoundary(db);
  const rateLimitPreHandlers = options?.rateLimitPreHandlers;
  const withAuthenticatedRateLimit = (guard: preHandlerHookHandler) =>
    rateLimitPreHandlers?.authenticated
      ? [guard, rateLimitPreHandlers.authenticated]
      : [guard];

  app.get(
    "/math/questions",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (_request, reply) => {
      sendUnavailable(reply, await mathServices.questions.list());
    }
  );

  app.get(
    "/math/questions/:questionId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.questionParams,
        "invalid_math_question_params"
      );
      if (!params) {
        return;
      }

      sendUnavailable(reply, await mathServices.questions.read(params.questionId));
    }
  );

  app.post(
    "/math/questions/:questionId/submissions",
    {
      preHandler: withAuthenticatedRateLimit(
        requireAccess("approved_collaborator_or_higher")
      )
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.questionParams,
        "invalid_math_question_params"
      );
      if (!params) {
        return;
      }

      const input = parseBody(
        request,
        reply,
        mathLeanSubmissionContract.submissionCreateInput,
        "invalid_math_submission_payload"
      );
      if (!input) {
        return;
      }

      if (input.mathQuestionId !== params.questionId) {
        reply.code(400).send({
          error: "math_submission_question_mismatch"
        });
        return;
      }

      sendUnavailable(
        reply,
        await mathServices.submissions.create(params.questionId, input)
      );
    }
  );

  app.get(
    "/math/submissions/:submissionId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.submissionParams,
        "invalid_math_submission_params"
      );
      if (!params) {
        return;
      }

      sendUnavailable(
        reply,
        await mathServices.submissions.read(params.submissionId)
      );
    }
  );

  app.patch(
    "/math/submissions/:submissionId/lean-profile",
    {
      preHandler: withAuthenticatedRateLimit(
        requireAccess("approved_collaborator_or_higher")
      )
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.submissionParams,
        "invalid_math_submission_params"
      );
      if (!params) {
        return;
      }

      const input = parseBody(
        request,
        reply,
        mathLeanSubmissionContract.submissionPatchInput,
        "invalid_math_lean_profile_payload"
      );
      if (!input) {
        return;
      }

      sendUnavailable(
        reply,
        await mathServices.leanWorkflow.updateSubmissionProfile(
          params.submissionId,
          input
        )
      );
    }
  );

  app.patch(
    "/math/submissions/:submissionId/review-gates/:reviewGateKind",
    {
      preHandler: withAuthenticatedRateLimit(
        requireAccess("approved_collaborator_or_higher")
      )
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.reviewGateParams,
        "invalid_math_review_gate_params"
      );
      if (!params) {
        return;
      }

      const input = parseBody(
        request,
        reply,
        mathLeanSubmissionContract.reviewGateUpdateInput,
        "invalid_math_review_gate_payload"
      );
      if (!input) {
        return;
      }

      sendUnavailable(
        reply,
        await mathServices.leanWorkflow.updateReviewGate(
          params.submissionId,
          params.reviewGateKind,
          input
        )
      );
    }
  );

  app.get(
    "/math/reviews",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (_request, reply) => {
      sendUnavailable(reply, await mathServices.reviews.list());
    }
  );

  app.get(
    "/math/reviews/:reviewId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.reviewParams,
        "invalid_math_review_params"
      );
      if (!params) {
        return;
      }

      sendUnavailable(reply, await mathServices.reviews.read(params.reviewId));
    }
  );

  app.get(
    "/math/package-candidates",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (_request, reply) => {
      sendUnavailable(reply, await mathServices.packaging.listPackageCandidates());
    }
  );

  app.get(
    "/math/package-candidates/:packageCandidateId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.packageCandidateParams,
        "invalid_math_package_candidate_params"
      );
      if (!params) {
        return;
      }

      sendUnavailable(
        reply,
        await mathServices.packaging.readPackageCandidate(params.packageCandidateId)
      );
    }
  );

  app.get(
    "/math/releases",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (_request, reply) => {
      sendUnavailable(reply, await mathServices.releases.list());
    }
  );

  app.get(
    "/math/releases/:releaseId",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.releaseParams,
        "invalid_math_release_params"
      );
      if (!params) {
        return;
      }

      sendUnavailable(reply, await mathServices.releases.read(params.releaseId));
    }
  );

  app.get(
    "/math/questions/:questionId/launch",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const params = parseParams(
        request,
        reply,
        mathApiContract.questionParams,
        "invalid_math_question_params"
      );
      if (!params) {
        return;
      }

      sendUnavailable(
        reply,
        await mathServices.launches.readQuestionLaunch(params.questionId)
      );
    }
  );
}
