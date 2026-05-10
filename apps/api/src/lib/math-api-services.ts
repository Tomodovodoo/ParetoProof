import type {
  MathApiUnavailableResponse,
  MathLeanReviewGateUpdateInput,
  MathLeanSubmissionCreateInput,
  MathLeanSubmissionPatchInput
} from "@paretoproof/shared";
import { buildMathApiUnavailableResponse } from "./math-api-readiness.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

type UnavailableResult = Promise<MathApiUnavailableResponse>;

export type MathApiServiceBoundary = {
  launches: {
    readQuestionLaunch(questionId: string): UnavailableResult;
  };
  leanWorkflow: {
    updateReviewGate(
      submissionId: string,
      reviewGateKind: string,
      input: MathLeanReviewGateUpdateInput
    ): UnavailableResult;
    updateSubmissionProfile(
      submissionId: string,
      input: MathLeanSubmissionPatchInput
    ): UnavailableResult;
  };
  packaging: {
    listPackageCandidates(): UnavailableResult;
    readPackageCandidate(packageCandidateId: string): UnavailableResult;
  };
  questions: {
    list(): UnavailableResult;
    read(questionId: string): UnavailableResult;
  };
  releases: {
    list(): UnavailableResult;
    read(releaseId: string): UnavailableResult;
  };
  reviews: {
    list(): UnavailableResult;
    read(reviewId: string): UnavailableResult;
  };
  submissions: {
    create(questionId: string, input: MathLeanSubmissionCreateInput): UnavailableResult;
    read(submissionId: string): UnavailableResult;
  };
};

export function createMathApiServiceBoundary(
  _db: ReturnTypeOfCreateDbClient
): MathApiServiceBoundary {
  // The real read/write paths wait for the math persistence migration; this
  // boundary keeps route ownership explicit without pretending data exists.
  return {
    launches: {
      async readQuestionLaunch(_questionId) {
        return buildMathApiUnavailableResponse("launch");
      }
    },
    leanWorkflow: {
      async updateReviewGate(_submissionId, _reviewGateKind, _input) {
        return buildMathApiUnavailableResponse("lean_workflow");
      },
      async updateSubmissionProfile(_submissionId, _input) {
        return buildMathApiUnavailableResponse("lean_workflow");
      }
    },
    packaging: {
      async listPackageCandidates() {
        return buildMathApiUnavailableResponse("package_candidates");
      },
      async readPackageCandidate(_packageCandidateId) {
        return buildMathApiUnavailableResponse("package_candidate");
      }
    },
    questions: {
      async list() {
        return buildMathApiUnavailableResponse("questions");
      },
      async read(_questionId) {
        return buildMathApiUnavailableResponse("question");
      }
    },
    releases: {
      async list() {
        return buildMathApiUnavailableResponse("releases");
      },
      async read(_releaseId) {
        return buildMathApiUnavailableResponse("release");
      }
    },
    reviews: {
      async list() {
        return buildMathApiUnavailableResponse("reviews");
      },
      async read(_reviewId) {
        return buildMathApiUnavailableResponse("review");
      }
    },
    submissions: {
      async create(_questionId, _input) {
        return buildMathApiUnavailableResponse("submission");
      },
      async read(_submissionId) {
        return buildMathApiUnavailableResponse("submission");
      }
    }
  };
}
