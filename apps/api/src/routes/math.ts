import {
  mathHostedLaunchCreateInputSchema,
  mathLocalConnectedLaunchCreateInputSchema,
  mathOfflineExportCreateInputSchema,
  mathQuestionParamsSchema,
  mathRunnerBootstrapSessionParamsSchema,
  mathRunnerBootstrapSessionRedeemInputSchema
} from "@paretoproof/shared";
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerHookHandler
} from "fastify";
import { createMathLaunchService, MathLaunchServiceError } from "../lib/math-launch.js";
import type { createRateLimitPreHandlers } from "../middleware/rate-limit.js";
import type { ReturnTypeOfCreateAccessGuard } from "../types/access-guard.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

function zodIssuesToResponse(issues: Array<{ message: string; path: (string | number)[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function getApprovedActorUserId(request: FastifyRequest) {
  const context = request.accessRbacContext;

  if (context?.status !== "approved" || !context.userId) {
    throw new Error("Approved math access context was not attached to the request.");
  }

  return context.userId;
}

function replyWithMathLaunchError(
  reply: {
    code: (statusCode: number) => { send: (payload: unknown) => void };
  },
  error: MathLaunchServiceError
) {
  reply.code(error.statusCode).send({
    error: error.code,
    issues: error.issues
  });
}

export function registerMathRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient,
  requireAccess: ReturnTypeOfCreateAccessGuard,
  options?: {
    mathLaunchService?: ReturnType<typeof createMathLaunchService>;
    rateLimitPreHandlers?: ReturnType<typeof createRateLimitPreHandlers>;
  }
) {
  const mathLaunchService = options?.mathLaunchService ?? createMathLaunchService(db);
  const rateLimitPreHandlers = options?.rateLimitPreHandlers;
  const withAuthenticatedRateLimit = (guard: preHandlerHookHandler) =>
    rateLimitPreHandlers?.authenticated
      ? [guard, rateLimitPreHandlers.authenticated]
      : [guard];

  app.get(
    "/math/questions/:questionId/launch",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const parsedParams = mathQuestionParamsSchema.safeParse(request.params ?? {});

      if (!parsedParams.success) {
        reply.code(400).send({
          error: "invalid_math_question_params",
          issues: zodIssuesToResponse(parsedParams.error.issues)
        });
        return;
      }

      const response = await mathLaunchService.getQuestionLaunchView(parsedParams.data.questionId);

      if (!response) {
        reply.code(404).send({
          error: "math_question_not_found"
        });
        return;
      }

      reply.send(response);
    }
  );

  app.post(
    "/math/questions/:questionId/launches/hosted",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const parsedParams = mathQuestionParamsSchema.safeParse(request.params ?? {});
      const parsedBody = mathHostedLaunchCreateInputSchema.safeParse(request.body ?? {});

      if (!parsedParams.success || !parsedBody.success) {
        reply.code(400).send({
          error: "invalid_math_hosted_launch_payload",
          issues: [
            ...(parsedParams.success ? [] : zodIssuesToResponse(parsedParams.error.issues)),
            ...(parsedBody.success ? [] : zodIssuesToResponse(parsedBody.error.issues))
          ]
        });
        return;
      }

      try {
        const response = await mathLaunchService.createHostedLaunch(
          parsedParams.data.questionId,
          parsedBody.data,
          getApprovedActorUserId(request)
        );
        reply.code(201).send(response);
      } catch (error) {
        if (error instanceof MathLaunchServiceError) {
          replyWithMathLaunchError(reply, error);
          return;
        }

        throw error;
      }
    }
  );

  app.post(
    "/math/questions/:questionId/launches/local-connected",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const parsedParams = mathQuestionParamsSchema.safeParse(request.params ?? {});
      const parsedBody = mathLocalConnectedLaunchCreateInputSchema.safeParse(request.body ?? {});

      if (!parsedParams.success || !parsedBody.success) {
        reply.code(400).send({
          error: "invalid_math_local_bootstrap_payload",
          issues: [
            ...(parsedParams.success ? [] : zodIssuesToResponse(parsedParams.error.issues)),
            ...(parsedBody.success ? [] : zodIssuesToResponse(parsedBody.error.issues))
          ]
        });
        return;
      }

      try {
        const response = await mathLaunchService.createLocalBootstrap(
          parsedParams.data.questionId,
          parsedBody.data,
          getApprovedActorUserId(request)
        );
        reply.code(201).send(response);
      } catch (error) {
        if (error instanceof MathLaunchServiceError) {
          replyWithMathLaunchError(reply, error);
          return;
        }

        throw error;
      }
    }
  );

  app.post(
    "/math/questions/:questionId/launches/offline-export",
    {
      preHandler: withAuthenticatedRateLimit(requireAccess("approved_helper_or_higher"))
    },
    async (request, reply) => {
      const parsedParams = mathQuestionParamsSchema.safeParse(request.params ?? {});
      const parsedBody = mathOfflineExportCreateInputSchema.safeParse(request.body ?? {});

      if (!parsedParams.success || !parsedBody.success) {
        reply.code(400).send({
          error: "invalid_math_offline_export_payload",
          issues: [
            ...(parsedParams.success ? [] : zodIssuesToResponse(parsedParams.error.issues)),
            ...(parsedBody.success ? [] : zodIssuesToResponse(parsedBody.error.issues))
          ]
        });
        return;
      }

      try {
        const response = await mathLaunchService.createOfflineExport(
          parsedParams.data.questionId,
          parsedBody.data,
          getApprovedActorUserId(request)
        );
        reply.code(201).send(response);
      } catch (error) {
        if (error instanceof MathLaunchServiceError) {
          replyWithMathLaunchError(reply, error);
          return;
        }

        throw error;
      }
    }
  );

  app.post(
    "/internal/math/runner-bootstrap-sessions/:bootstrapSessionId/redeem",
    async (request, reply) => {
      const parsedParams = mathRunnerBootstrapSessionParamsSchema.safeParse(request.params ?? {});
      const parsedBody = mathRunnerBootstrapSessionRedeemInputSchema.safeParse(request.body ?? {});

      if (!parsedParams.success || !parsedBody.success) {
        reply.code(400).send({
          error: "invalid_math_runner_bootstrap_payload",
          issues: [
            ...(parsedParams.success ? [] : zodIssuesToResponse(parsedParams.error.issues)),
            ...(parsedBody.success ? [] : zodIssuesToResponse(parsedBody.error.issues))
          ]
        });
        return;
      }

      try {
        const response = await mathLaunchService.redeemRunnerBootstrapSession(
          parsedParams.data.bootstrapSessionId,
          parsedBody.data
        );
        reply.send(response);
      } catch (error) {
        if (error instanceof MathLaunchServiceError) {
          replyWithMathLaunchError(reply, error);
          return;
        }

        throw error;
      }
    }
  );
}
