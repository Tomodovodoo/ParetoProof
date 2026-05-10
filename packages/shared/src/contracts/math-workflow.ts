import {
  mathArtifactBackingTypes,
  mathArtifactSubjectTypes,
  mathAutomationSummaryPostures,
  mathPackageCandidatePostures,
  mathPackageCandidateSourceTypes,
  mathQuestionPostures,
  mathQuestionRevisionPostures,
  mathReleaseLinkPostures,
  mathReviewAssignmentRoles,
  mathReviewAssignmentStates,
  mathReviewChecklistStates,
  mathReviewKinds,
  mathReviewRecordPostures,
  mathReviewRoundPostures,
  mathReviewSubjectTypes,
  mathSubmissionPostures,
  type MathWorkflowCatalogEntry
} from "../types/math-workflow.js";
import {
  mathArtifactRefSchema,
  mathPackageCandidateSourceRefSchema,
  mathReleaseLinkSchema,
  mathReviewSubjectRefSchema,
  mathWorkflowContractSummarySchema
} from "../schemas/math-workflow.js";

function toCatalogEntries<TId extends string>(
  ids: readonly TId[],
  summaries: Record<TId, string>
): MathWorkflowCatalogEntry<TId>[] {
  return ids.map((id) => ({
    id,
    summary: summaries[id]
  }));
}

export const mathQuestionPostureCatalog = toCatalogEntries(mathQuestionPostures, {
  active: "Stable question identity is available for submissions or launch context.",
  draft: "Question identity exists but is not yet reviewable or launchable.",
  superseded: "Question identity has been replaced by a newer durable question.",
  withdrawn: "Question identity was explicitly removed from active workflow."
});

export const mathQuestionRevisionPostureCatalog = toCatalogEntries(
  mathQuestionRevisionPostures,
  {
    accepted: "Revision is accepted as the current reviewed question definition.",
    draft: "Revision can still change before becoming reviewable.",
    rejected: "Revision was reviewed and rejected.",
    reviewable: "Revision is immutable enough to enter review or receive submissions.",
    superseded: "Revision was replaced by a newer immutable revision.",
    withdrawn: "Revision was explicitly withdrawn from workflow."
  }
);

export const mathSubmissionPostureCatalog = toCatalogEntries(
  mathSubmissionPostures,
  {
    accepted: "Submission was accepted by the relevant math workflow.",
    automation_complete:
      "Required automation has completed and the submission is ready for human review.",
    draft: "Submission can still change before formal handoff.",
    human_review_required:
      "Submission needs human review before package-candidate progression.",
    rejected: "Submission was reviewed and rejected.",
    submitted: "Submission has been handed to the durable workflow.",
    superseded: "Submission was replaced by a newer submission.",
    withdrawn: "Submission was explicitly withdrawn."
  }
);

export const mathAutomationSummaryPostureCatalog = toCatalogEntries(
  mathAutomationSummaryPostures,
  {
    failed: "Latest automation finished with failing evidence.",
    not_requested: "No automation has been requested for this subject.",
    passed: "Latest automation finished with passing evidence.",
    pending: "Automation is queued or running.",
    requires_review: "Automation produced evidence that needs human review.",
    superseded: "Automation evidence belongs to an older subject state."
  }
);

export const mathReviewKindCatalog = toCatalogEntries(mathReviewKinds, {
  editor_review: "Benchmark-policy, quality, and package-readiness review.",
  peer_review: "Substantive correctness review of submitted work.",
  release_decision: "Package-candidate release-readiness decision.",
  triage: "Readiness and routing review."
});

export const mathPackageCandidatePostureCatalog = toCatalogEntries(
  mathPackageCandidatePostures,
  {
    frozen: "Candidate has an accepted immutable package freeze.",
    proposed: "Candidate exists but has not started repository-backed progression.",
    rejected: "Candidate was rejected for package or release progression.",
    release_linked: "Candidate is linked to a benchmark release.",
    repo_synced: "Candidate is linked to repository sync state.",
    review_ready: "Candidate is ready for release-decision review.",
    superseded: "Candidate was replaced by a newer package candidate.",
    version_linked: "Candidate is linked to a benchmark version.",
    withdrawn: "Candidate was explicitly withdrawn."
  }
);

export const mathWorkflowContract = {
  artifactBackingTypes: mathArtifactBackingTypes,
  artifactRef: mathArtifactRefSchema,
  artifactSubjectTypes: mathArtifactSubjectTypes,
  automationSummaryPostures: mathAutomationSummaryPostures,
  packageCandidatePostures: mathPackageCandidatePostures,
  packageCandidateSourceRef: mathPackageCandidateSourceRefSchema,
  packageCandidateSourceTypes: mathPackageCandidateSourceTypes,
  questionPostures: mathQuestionPostures,
  questionRevisionPostures: mathQuestionRevisionPostures,
  releaseLink: mathReleaseLinkSchema,
  releaseLinkPostures: mathReleaseLinkPostures,
  reviewAssignmentRoles: mathReviewAssignmentRoles,
  reviewAssignmentStates: mathReviewAssignmentStates,
  reviewChecklistStates: mathReviewChecklistStates,
  reviewKinds: mathReviewKinds,
  reviewRecordPostures: mathReviewRecordPostures,
  reviewRoundPostures: mathReviewRoundPostures,
  reviewSubjectRef: mathReviewSubjectRefSchema,
  reviewSubjectTypes: mathReviewSubjectTypes,
  submissionPostures: mathSubmissionPostures,
  summary: mathWorkflowContractSummarySchema
};
