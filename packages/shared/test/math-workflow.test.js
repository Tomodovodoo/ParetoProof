import { describe, expect, it } from "bun:test";
import {
  auditEventCatalog,
  auditSubjectKindSchema,
  mathArtifactBackingTypes,
  mathArtifactSubjectTypes,
  mathPackageCandidatePostures,
  mathQuestionPostures,
  mathReleaseLinkPostures,
  mathReviewKinds,
  mathSubmissionPostures,
  mathWorkflowContract
} from "../dist/index.js";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("math workflow contracts", () => {
  it("exports the core math workflow vocabularies", () => {
    expect(mathQuestionPostures).toEqual([
      "draft",
      "active",
      "superseded",
      "withdrawn"
    ]);
    expect(mathSubmissionPostures).toContain("human_review_required");
    expect(mathReviewKinds).toEqual([
      "triage",
      "peer_review",
      "editor_review",
      "release_decision"
    ]);
    expect(mathPackageCandidatePostures).toContain("version_linked");
    expect(mathReleaseLinkPostures).toContain("published");
  });

  it("exposes a compact contract summary", () => {
    expect(
      mathWorkflowContract.summary.parse({
        artifactBackingTypes: [...mathArtifactBackingTypes],
        artifactSubjectTypes: [...mathArtifactSubjectTypes],
        packageCandidatePostures: [...mathPackageCandidatePostures],
        questionPostures: [...mathQuestionPostures],
        reviewKinds: [...mathReviewKinds],
        submissionPostures: [...mathSubmissionPostures]
      })
    ).toEqual({
      artifactBackingTypes: [...mathArtifactBackingTypes],
      artifactSubjectTypes: [...mathArtifactSubjectTypes],
      packageCandidatePostures: [...mathPackageCandidatePostures],
      questionPostures: [...mathQuestionPostures],
      reviewKinds: [...mathReviewKinds],
      submissionPostures: [...mathSubmissionPostures]
    });
  });

  it("rejects artifact refs without storage, digest, or repo metadata", () => {
    expect(
      mathWorkflowContract.artifactRef.safeParse({
        artifactId: null,
        artifactRole: "submission_entrypoint",
        backingMetadata: {},
        backingType: "uploaded_artifact",
        contentDigest: null,
        filename: "Candidate.lean",
        id: uuid,
        mathSubmissionId: uuid,
        mediaType: "text/plain",
        pathHint: "Candidate.lean",
        subjectType: "submission"
      }).success
    ).toBe(false);
  });

  it("accepts repo-linked question revision artifact refs with metadata", () => {
    expect(
      mathWorkflowContract.artifactRef.safeParse({
        artifactId: null,
        artifactRole: "statement_source",
        backingMetadata: {
          repo: "Tomodovodoo/ParetoProof",
          ref: "main",
          path: "benchmarks/firstproof/problem9/statements/problem.md"
        },
        backingType: "repo_linked_reference",
        contentDigest: "abc123",
        filename: "problem.md",
        id: uuid,
        mathQuestionRevisionId: uuid,
        mediaType: "text/markdown",
        pathHint: "statements/problem.md",
        subjectType: "question_revision"
      }).success
    ).toBe(true);
  });

  it("enforces release-link benchmark targets after linkage", () => {
    expect(
      mathWorkflowContract.releaseLink.safeParse({
        benchmarkReleaseId: null,
        benchmarkVersionId: null,
        id: uuid,
        mathPackageCandidateId: "math-candidate-1",
        mathQuestionId: uuid,
        posture: "version_linked"
      }).success
    ).toBe(false);

    expect(
      mathWorkflowContract.releaseLink.safeParse({
        benchmarkReleaseId: null,
        benchmarkVersionId: "firstproof/Problem9@2026-04-02",
        id: uuid,
        mathPackageCandidateId: "math-candidate-1",
        mathQuestionId: uuid,
        posture: "version_linked"
      }).success
    ).toBe(true);

    expect(
      mathWorkflowContract.releaseLink.safeParse({
        benchmarkReleaseId: null,
        benchmarkVersionId: "firstproof/Problem9@2026-04-02",
        id: uuid,
        mathPackageCandidateId: "math-candidate-1",
        mathQuestionId: uuid,
        posture: "published"
      }).success
    ).toBe(false);
  });

  it("keeps audit schemas aware of math workflow subjects", () => {
    expect(auditSubjectKindSchema.safeParse("math_submission").success).toBe(true);
    expect(
      auditEventCatalog.some((entry) => entry.id === "math_review.decision_recorded")
    ).toBe(true);
  });
});
