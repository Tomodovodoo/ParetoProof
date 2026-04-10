import { z } from "zod";

const timestampSchema = z.string().min(1);
const nonEmptyStringSchema = z.string().trim().min(1);
const nullableNoteSchema = z.string().trim().min(1).max(2_000).nullable().default(null);
const summaryPayloadSchema = z.record(z.string(), z.unknown());

function hasRepoPullRequestLink(value: {
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
}) {
  return value.pullRequestNumber !== null &&
    value.pullRequestNumber !== undefined &&
    value.pullRequestUrl !== null &&
    value.pullRequestUrl !== undefined;
}

export const repoSyncRecordStatusSchema = z.enum([
  "proposed",
  "pr_open",
  "merged",
  "rejected",
  "superseded"
]);

export const packageFreezeStatusSchema = z.enum([
  "active"
]);

export const benchmarkVersionLaunchabilitySchema = z.enum([
  "internal_only",
  "launchable"
]);

export const benchmarkReleaseStatusSchema = z.enum([
  "draft",
  "approved",
  "published"
]);

export const benchmarkReleaseVisibilitySchema = z.enum([
  "internal_only",
  "held_out",
  "public"
]);

export const repoSyncRecordSchema = z.object({
  createdAt: timestampSchema,
  id: z.string().uuid(),
  lastUpdatedByUserId: z.string().uuid().nullable(),
  mathPackageCandidateId: nonEmptyStringSchema.nullable(),
  mergeCommitSha: nonEmptyStringSchema.nullable(),
  note: z.string().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestUrl: z.string().url().nullable(),
  recordedByUserId: z.string().uuid().nullable(),
  repoName: nonEmptyStringSchema,
  repoOwner: nonEmptyStringSchema,
  status: repoSyncRecordStatusSchema,
  targetRepoPath: nonEmptyStringSchema,
  updatedAt: timestampSchema
});

export const packageFreezeSchema = z.object({
  benchmarkFamily: nonEmptyStringSchema,
  createdAt: timestampSchema,
  createdByUserId: z.string().uuid().nullable(),
  id: z.string().uuid(),
  mathPackageCandidateId: nonEmptyStringSchema.nullable(),
  note: z.string().nullable(),
  packageDigest: nonEmptyStringSchema,
  packageId: nonEmptyStringSchema,
  packageVersion: nonEmptyStringSchema,
  repoCommitSha: nonEmptyStringSchema,
  repoSyncRecordId: z.string().uuid(),
  repoTreePath: nonEmptyStringSchema,
  status: packageFreezeStatusSchema,
  updatedAt: timestampSchema
});

export const benchmarkVersionSchema = z.object({
  benchmarkFamily: nonEmptyStringSchema,
  benchmarkVersionId: nonEmptyStringSchema,
  createdAt: timestampSchema,
  createdByUserId: z.string().uuid().nullable(),
  displayLabel: nonEmptyStringSchema,
  itemSetDefinition: summaryPayloadSchema.nullable(),
  launchability: benchmarkVersionLaunchabilitySchema,
  packageDigest: nonEmptyStringSchema,
  packageFreezeId: z.string().uuid(),
  packageId: nonEmptyStringSchema,
  packageVersion: nonEmptyStringSchema,
  scopeLabel: nonEmptyStringSchema,
  updatedAt: timestampSchema
});

export const benchmarkReleaseSchema = z.object({
  approvedAt: timestampSchema.nullable(),
  approvedByUserId: z.string().uuid().nullable(),
  benchmarkReleaseId: nonEmptyStringSchema,
  benchmarkVersionId: nonEmptyStringSchema,
  createdAt: timestampSchema,
  createdByUserId: z.string().uuid().nullable(),
  methodologyArtifactRefs: z.array(nonEmptyStringSchema),
  publishedAt: timestampSchema.nullable(),
  releaseLabel: nonEmptyStringSchema,
  status: benchmarkReleaseStatusSchema,
  summaryArtifactRefs: z.array(nonEmptyStringSchema),
  summaryPayload: summaryPayloadSchema.nullable(),
  updatedAt: timestampSchema,
  visibility: benchmarkReleaseVisibilitySchema
});

export const adminRepoSyncRecordCreateInputSchema = z
  .object({
    mathPackageCandidateId: nonEmptyStringSchema.nullable().default(null),
    mergeCommitSha: nonEmptyStringSchema.nullable().default(null),
    note: nullableNoteSchema,
    pullRequestNumber: z.number().int().positive().nullable().default(null),
    pullRequestUrl: z.string().url().nullable().default(null),
    repoName: nonEmptyStringSchema,
    repoOwner: nonEmptyStringSchema,
    status: repoSyncRecordStatusSchema.default("proposed"),
    targetRepoPath: nonEmptyStringSchema
  })
  .superRefine((value, context) => {
    const hasFullLink = hasRepoPullRequestLink(value);
    const hasPartialLink = !hasFullLink && (
      value.pullRequestNumber !== null ||
      value.pullRequestUrl !== null
    );

    if (hasPartialLink) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pullRequestNumber and pullRequestUrl must be provided together.",
        path: ["pullRequestNumber"]
      });
    }
  });

export const adminRepoSyncRecordStatusUpdateInputSchema = z
  .object({
    mergeCommitSha: nonEmptyStringSchema.nullable().optional(),
    note: z.string().trim().min(1).max(2_000).nullable().optional(),
    pullRequestNumber: z.number().int().positive().nullable().optional(),
    pullRequestUrl: z.string().url().nullable().optional(),
    status: repoSyncRecordStatusSchema
  })
  .superRefine((value, context) => {
    const hasFullLink = hasRepoPullRequestLink(value);
    const hasPartialLink = !hasFullLink && (
      value.pullRequestNumber !== undefined ||
      value.pullRequestUrl !== undefined
    );

    if (hasPartialLink) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pullRequestNumber and pullRequestUrl must be provided together when updating PR linkage.",
        path: ["pullRequestNumber"]
      });
    }
  });

export const adminPackageFreezeCreateInputSchema = z.object({
  benchmarkFamily: nonEmptyStringSchema,
  note: nullableNoteSchema,
  packageDigest: nonEmptyStringSchema,
  packageId: nonEmptyStringSchema,
  packageVersion: nonEmptyStringSchema,
  repoCommitSha: nonEmptyStringSchema,
  repoSyncRecordId: z.string().uuid()
});

export const adminBenchmarkVersionCreateInputSchema = z.object({
  benchmarkVersionId: nonEmptyStringSchema,
  displayLabel: nonEmptyStringSchema.nullable().default(null),
  itemSetDefinition: summaryPayloadSchema.nullable().default(null),
  scopeLabel: nonEmptyStringSchema.default("full")
});

export const adminBenchmarkVersionLaunchabilityUpdateInputSchema = z.object({
  launchability: benchmarkVersionLaunchabilitySchema
});

export const adminBenchmarkReleaseCreateInputSchema = z.object({
  benchmarkReleaseId: nonEmptyStringSchema,
  methodologyArtifactRefs: z.array(nonEmptyStringSchema).default([]),
  releaseLabel: nonEmptyStringSchema,
  summaryArtifactRefs: z.array(nonEmptyStringSchema).default([]),
  summaryPayload: summaryPayloadSchema.nullable().default(null),
  visibility: benchmarkReleaseVisibilitySchema.default("internal_only")
});

export const adminBenchmarkWorkflowActionInputSchema = z.object({}).strict();

export const repoSyncRecordParamsSchema = z.object({
  repoSyncRecordId: z.string().uuid()
});

export const packageFreezeParamsSchema = z.object({
  packageFreezeId: z.string().uuid()
});

export const benchmarkVersionParamsSchema = z.object({
  benchmarkVersionId: nonEmptyStringSchema
});

export const benchmarkReleaseParamsSchema = z.object({
  benchmarkReleaseId: nonEmptyStringSchema
});

export const repoSyncRecordListResponseSchema = z.object({
  items: z.array(repoSyncRecordSchema)
});

export const repoSyncRecordDetailResponseSchema = z.object({
  item: repoSyncRecordSchema
});

export const packageFreezeListResponseSchema = z.object({
  items: z.array(packageFreezeSchema)
});

export const packageFreezeDetailResponseSchema = z.object({
  item: packageFreezeSchema
});

export const benchmarkVersionListResponseSchema = z.object({
  items: z.array(benchmarkVersionSchema)
});

export const benchmarkVersionDetailResponseSchema = z.object({
  item: benchmarkVersionSchema
});

export const benchmarkReleaseListResponseSchema = z.object({
  items: z.array(benchmarkReleaseSchema)
});

export const benchmarkReleaseDetailResponseSchema = z.object({
  item: benchmarkReleaseSchema
});

