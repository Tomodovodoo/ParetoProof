import assert from "node:assert/strict";
import test from "node:test";
import {
  mathArtifactBackingTypes,
  mathArtifactSubjectTypes,
  mathPackageCandidatePostures,
  mathPackageCandidateSourceTypes,
  mathQuestionPostures,
  mathQuestionRevisionPostures,
  mathReleaseLinkPostures,
  mathReviewKinds,
  mathReviewRecordPostures,
  mathReviewSubjectTypes,
  mathSubmissionPostures
} from "@paretoproof/shared";
import { getTableName } from "drizzle-orm";
import {
  mathArtifactBackingTypeEnum,
  mathArtifactRefs,
  mathArtifactSubjectTypeEnum,
  mathPackageCandidatePostureEnum,
  mathPackageCandidateSourceTypeEnum,
  mathPackageCandidates,
  mathQuestionPostureEnum,
  mathQuestionRevisionPostureEnum,
  mathQuestionRevisions,
  mathQuestions,
  mathReleaseLinkPostureEnum,
  mathReleaseLinks,
  mathReviewKindEnum,
  mathReviewRecordPostureEnum,
  mathReviewRecords,
  mathReviewSubjectTypeEnum,
  mathSubmissionPostureEnum,
  mathSubmissions
} from "../src/db/schema.ts";

test("math workflow database enums stay sourced from the shared contract", () => {
  assert.deepEqual(mathQuestionPostureEnum.enumValues, [...mathQuestionPostures]);
  assert.deepEqual(mathQuestionRevisionPostureEnum.enumValues, [
    ...mathQuestionRevisionPostures
  ]);
  assert.deepEqual(mathSubmissionPostureEnum.enumValues, [...mathSubmissionPostures]);
  assert.deepEqual(mathArtifactSubjectTypeEnum.enumValues, [
    ...mathArtifactSubjectTypes
  ]);
  assert.deepEqual(mathArtifactBackingTypeEnum.enumValues, [
    ...mathArtifactBackingTypes
  ]);
  assert.deepEqual(mathReviewSubjectTypeEnum.enumValues, [...mathReviewSubjectTypes]);
  assert.deepEqual(mathReviewKindEnum.enumValues, [...mathReviewKinds]);
  assert.deepEqual(mathReviewRecordPostureEnum.enumValues, [
    ...mathReviewRecordPostures
  ]);
  assert.deepEqual(mathPackageCandidateSourceTypeEnum.enumValues, [
    ...mathPackageCandidateSourceTypes
  ]);
  assert.deepEqual(mathPackageCandidatePostureEnum.enumValues, [
    ...mathPackageCandidatePostures
  ]);
  assert.deepEqual(mathReleaseLinkPostureEnum.enumValues, [
    ...mathReleaseLinkPostures
  ]);
});

test("math workflow database schema exports the critical lineage tables", () => {
  assert.deepEqual(
    [
      mathQuestions,
      mathQuestionRevisions,
      mathSubmissions,
      mathReviewRecords,
      mathPackageCandidates,
      mathReleaseLinks,
      mathArtifactRefs
    ].map((table) => getTableName(table)),
    [
      "math_questions",
      "math_question_revisions",
      "math_submissions",
      "math_review_records",
      "math_package_candidates",
      "math_release_links",
      "math_artifact_refs"
    ]
  );
});
