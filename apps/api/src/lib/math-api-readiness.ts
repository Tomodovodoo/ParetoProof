import type {
  MathApiUnavailableResource,
  MathApiUnavailableResponse
} from "@paretoproof/shared";

type MathApiReadinessEntry = {
  message: string;
  nextStep: string;
  requiredIssues: string[];
  resource: MathApiUnavailableResource;
};

const mathApiReadinessByResource = {
  lean_workflow: {
    message:
      "Math Lean workflow routes are registered, but durable submission workflow state is not configured yet.",
    nextStep:
      "Land #893 before enabling Lean profile and review-gate workflow mutations.",
    requiredIssues: ["#893"],
    resource: "lean_workflow"
  },
  launch: {
    message:
      "Math launch routes are registered, but launch-source and bootstrap persistence is not configured yet.",
    nextStep:
      "Land #887 and #893 before enabling question-scoped launch readiness.",
    requiredIssues: ["#887", "#893"],
    resource: "launch"
  },
  package_candidate: {
    message:
      "Math package-candidate routes are registered, but package-candidate persistence is not configured yet.",
    nextStep:
      "Land #893 before enabling math package-candidate detail read models.",
    requiredIssues: ["#893"],
    resource: "package_candidate"
  },
  package_candidates: {
    message:
      "Math package-candidate routes are registered, but math package-candidate persistence is not configured yet.",
    nextStep:
      "Land #893 before enabling math package-candidate read models.",
    requiredIssues: ["#893"],
    resource: "package_candidates"
  },
  question: {
    message:
      "Math question routes are registered, but durable question persistence is not configured yet.",
    nextStep: "Land #893 before enabling math question detail routes.",
    requiredIssues: ["#893"],
    resource: "question"
  },
  questions: {
    message:
      "Math question routes are registered, but durable question persistence is not configured yet.",
    nextStep: "Land #893 before enabling math question listing routes.",
    requiredIssues: ["#893"],
    resource: "questions"
  },
  release: {
    message:
      "Math release routes are registered, but math release lineage persistence is not configured yet.",
    nextStep: "Land #893 before enabling math release detail routes.",
    requiredIssues: ["#893"],
    resource: "release"
  },
  releases: {
    message:
      "Math release routes are registered, but math release lineage persistence is not configured yet.",
    nextStep: "Land #893 before enabling math release listing routes.",
    requiredIssues: ["#893"],
    resource: "releases"
  },
  review: {
    message:
      "Math review routes are registered, but durable review workflow persistence is not configured yet.",
    nextStep: "Land #893 before enabling math review detail routes.",
    requiredIssues: ["#893"],
    resource: "review"
  },
  reviews: {
    message:
      "Math review routes are registered, but durable review workflow persistence is not configured yet.",
    nextStep: "Land #893 before enabling math review queues.",
    requiredIssues: ["#893"],
    resource: "reviews"
  },
  submission: {
    message:
      "Math submission routes are registered, but durable submission and artifact-reference persistence is not configured yet.",
    nextStep:
      "Land #893 before enabling submission state, and #894 before accepting raw artifact uploads.",
    requiredIssues: ["#893", "#894"],
    resource: "submission"
  }
} satisfies Record<MathApiUnavailableResource, MathApiReadinessEntry>;

export function buildMathApiUnavailableResponse(
  resource: MathApiUnavailableResource
): MathApiUnavailableResponse {
  const entry = mathApiReadinessByResource[resource];

  return {
    error: "math_api_route_not_ready",
    message: entry.message,
    nextStep: entry.nextStep,
    requiredIssues: [...entry.requiredIssues],
    resource: entry.resource
  };
}
