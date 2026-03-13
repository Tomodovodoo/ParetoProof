import { z } from "zod";

export const artifactStorageModeSchema = z.enum([
  "postgres_metadata_only",
  "r2_object_with_postgres_metadata"
]);

export const artifactBucketClassSchema = z.enum([
  "artifacts_bucket",
  "exports_bucket",
  "none"
]);

export const artifactOwnerKindSchema = z.enum([
  "run",
  "job_attempt",
  "benchmark_version",
  "problem"
]);

export const artifactVisibilitySchema = z.enum([
  "private",
  "restricted",
  "public"
]);

export const artifactClassSchema = z.enum([
  "run_log_chunk",
  "run_trace_bundle",
  "run_artifact_blob",
  "run_export_bundle",
  "benchmark_source_bundle",
  "benchmark_report_bundle",
  "problem_attachment"
]);

export const artifactClassCatalogEntrySchema = z.object({
  bucketClass: artifactBucketClassSchema,
  description: z.string(),
  id: artifactClassSchema,
  ownerKind: artifactOwnerKindSchema,
  r2PrefixTemplate: z.string().nullable(),
  storageMode: artifactStorageModeSchema,
  visibility: artifactVisibilitySchema
});
