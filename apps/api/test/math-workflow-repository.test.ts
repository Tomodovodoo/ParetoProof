import assert from "node:assert/strict";
import test from "node:test";
import {
  auditEvents,
  mathPackageCandidates,
  mathQuestionRevisions,
  mathQuestions,
  mathReleaseLinks
} from "../src/db/schema.ts";
import {
  createMathWorkflowAuditEvent,
  createMathWorkflowRepository,
  mathWorkflowRepositoryTestUtils
} from "../src/lib/math-workflow-repository.ts";

const actorUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mathQuestionId = "11111111-1111-4111-8111-111111111111";
const mathQuestionRevisionId = "22222222-2222-4222-8222-222222222222";
const mathReleaseLinkId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-04-02T18:00:00.000Z");

function createFakeDb(returnRows: Map<unknown, unknown>) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const updates: Array<{ table: unknown; value: Record<string, unknown> }> = [];

  const makeMutationClient = () => ({
    insert(table: unknown) {
      return {
        values(value: unknown) {
          inserts.push({ table, value });

          return {
            returning: async () => [returnRows.get(table) ?? value]
          };
        }
      };
    },
    update(table: unknown) {
      return {
        set(value: Record<string, unknown>) {
          updates.push({ table, value });

          return {
            where() {
              return {
                returning: async () => [returnRows.get(table) ?? value]
              };
            }
          };
        }
      };
    }
  });

  return {
    inserts,
    transaction: async <T>(callback: (tx: ReturnType<typeof makeMutationClient>) => T) =>
      callback(makeMutationClient()),
    updates,
    ...makeMutationClient()
  };
}

test("createMathWorkflowAuditEvent emits portal-user audit inserts", () => {
  assert.deepEqual(
    createMathWorkflowAuditEvent({
      actorUserId,
      eventId: "math_question.created",
      payload: {
        actorUserId,
        mathQuestionId,
        slug: "problem-9"
      },
      severity: "info",
      subjectKind: "math_question"
    }),
    {
      actorKind: "portal_user",
      actorUserId,
      eventId: "math_question.created",
      payload: {
        actorUserId,
        mathQuestionId,
        slug: "problem-9"
      },
      severity: "info",
      subjectKind: "math_question",
      targetUserId: null
    }
  );
});

test("math workflow repository preserves the question-to-release lineage path", async () => {
  const revisionRow: typeof mathQuestionRevisions.$inferSelect = {
    authorUserId: actorUserId,
    benchmarkMetadata: {},
    createdAt: now,
    formalStatementPayload: null,
    id: mathQuestionRevisionId,
    mathQuestionId,
    posture: "reviewable",
    provenancePayload: {},
    revisionNumber: 1,
    statementPayload: {
      source: "problem9"
    },
    supersedesRevisionId: null
  };
  const candidateRow: typeof mathPackageCandidates.$inferSelect = {
    createdAt: now,
    createdByUserId: actorUserId,
    createdFromReviewRecordId: null,
    latestReviewRecordId: null,
    linkedBenchmarkVersionId: null,
    mathPackageCandidateId: "math-candidate-1",
    mathQuestionId,
    mathQuestionRevisionId,
    mathSubmissionId: null,
    posture: "proposed",
    proposedPackageId: "firstproof/Problem9",
    proposedPackageVersion: "2026-04-02",
    sourceType: "question_revision",
    updatedAt: now
  };
  const releaseLinkRow: typeof mathReleaseLinks.$inferSelect = {
    benchmarkReleaseId: null,
    benchmarkVersionId: "firstproof/Problem9@2026-04-02",
    createdAt: now,
    createdByUserId: actorUserId,
    id: mathReleaseLinkId,
    mathPackageCandidateId: "math-candidate-1",
    mathQuestionId,
    posture: "version_linked",
    updatedAt: now
  };
  const db = createFakeDb(
    new Map<unknown, unknown>([
      [mathQuestionRevisions, revisionRow],
      [mathPackageCandidates, candidateRow],
      [mathReleaseLinks, releaseLinkRow]
    ])
  );
  const repository = createMathWorkflowRepository(db as never);

  await repository.createMathQuestionRevision(
    {
      authorUserId: actorUserId,
      mathQuestionId,
      revisionNumber: 1,
      statementPayload: {
        source: "problem9"
      }
    },
    actorUserId
  );
  await repository.createMathPackageCandidate(
    {
      mathPackageCandidateId: "math-candidate-1",
      mathQuestionId,
      mathQuestionRevisionId,
      proposedPackageId: "firstproof/Problem9",
      proposedPackageVersion: "2026-04-02",
      sourceType: "question_revision"
    },
    actorUserId
  );
  await repository.createMathReleaseLink(
    {
      benchmarkVersionId: "firstproof/Problem9@2026-04-02",
      mathPackageCandidateId: "math-candidate-1",
      mathQuestionId,
      posture: "version_linked"
    },
    actorUserId
  );

  assert.equal(
    db.inserts.filter((insert) => insert.table === auditEvents).length,
    4
  );
  assert.equal(
    db.updates.some(
      (update) =>
        update.table === mathQuestions &&
        update.value.currentHeadRevisionId === mathQuestionRevisionId
    ),
    true
  );
  assert.equal(
    db.updates.some(
      (update) =>
        update.table === mathQuestions &&
        update.value.latestActivePackageCandidateId === "math-candidate-1"
    ),
    true
  );
  assert.equal(
    db.updates.some(
      (update) =>
        update.table === mathPackageCandidates &&
        update.value.posture === "version_linked" &&
        update.value.linkedBenchmarkVersionId === "firstproof/Problem9@2026-04-02"
    ),
    true
  );
  assert.equal(
    db.updates.some(
      (update) =>
        update.table === mathQuestions &&
        update.value.latestLinkedBenchmarkVersionId ===
          "firstproof/Problem9@2026-04-02"
    ),
    true
  );
});

test("release-link posture helper maps benchmark linkage into candidate posture", () => {
  assert.equal(
    mathWorkflowRepositoryTestUtils.packageCandidatePostureForReleaseLink(
      "version_linked"
    ),
    "version_linked"
  );
  assert.equal(
    mathWorkflowRepositoryTestUtils.packageCandidatePostureForReleaseLink(
      "published"
    ),
    "release_linked"
  );
  assert.equal(
    mathWorkflowRepositoryTestUtils.packageCandidatePostureForReleaseLink("planned"),
    null
  );
});
