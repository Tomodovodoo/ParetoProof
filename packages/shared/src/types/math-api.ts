export type MathApiUnavailableResource =
  | "lean_workflow"
  | "launch"
  | "package_candidate"
  | "package_candidates"
  | "question"
  | "questions"
  | "release"
  | "releases"
  | "review"
  | "reviews"
  | "submission";

export type MathApiUnavailableResponse = {
  error: "math_api_route_not_ready";
  message: string;
  nextStep: string;
  requiredIssues: string[];
  resource: MathApiUnavailableResource;
};
