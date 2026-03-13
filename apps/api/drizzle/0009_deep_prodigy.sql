create type "run_kind" as enum ('full_benchmark', 'benchmark_slice', 'single_run', 'repeated_n');
--> statement-breakpoint
create type "run_state" as enum ('created', 'queued', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled');
--> statement-breakpoint
create type "job_state" as enum ('queued', 'claimed', 'running', 'cancel_requested', 'completed', 'failed', 'cancelled');
--> statement-breakpoint
create type "attempt_state" as enum ('prepared', 'active', 'succeeded', 'failed', 'cancelled');
--> statement-breakpoint
create type "evaluation_verdict_class" as enum ('pass', 'fail', 'invalid_result');
--> statement-breakpoint
create type "artifact_class" as enum ('run_manifest', 'package_reference', 'prompt_package', 'candidate_source', 'verdict_record', 'compiler_output', 'compiler_diagnostics', 'verifier_output', 'environment_snapshot', 'usage_summary', 'execution_trace');
--> statement-breakpoint
create type "artifact_owner_scope" as enum ('run_attempt', 'benchmark_version', 'run_export');
--> statement-breakpoint
create type "artifact_storage_provider" as enum ('cloudflare_r2');
--> statement-breakpoint
create type "artifact_prefix_family" as enum ('run_artifacts', 'run_logs', 'run_traces', 'run_bundles', 'benchmark_source', 'benchmark_reports');
--> statement-breakpoint
create type "artifact_lifecycle_state" as enum ('registered', 'available', 'missing', 'quarantined', 'deleted');
--> statement-breakpoint
create table "runs" (
  "id" uuid primary key default gen_random_uuid() not null,
  "source_run_id" text not null,
  "run_kind" "run_kind" default 'single_run' not null,
  "state" "run_state" not null,
  "verdict_class" "evaluation_verdict_class" not null,
  "benchmark_package_id" text not null,
  "benchmark_package_version" text not null,
  "benchmark_package_digest" text not null,
  "benchmark_item_id" text not null,
  "lane_id" text not null,
  "prompt_protocol_version" text not null,
  "prompt_package_digest" text not null,
  "run_mode" text not null,
  "tool_profile" text not null,
  "harness_revision" text not null,
  "verifier_version" text not null,
  "provider_family" text not null,
  "auth_mode" text not null,
  "model_config_id" text not null,
  "model_snapshot_id" text not null,
  "environment_digest" text not null,
  "run_config_digest" text not null,
  "bundle_digest" text not null,
  "stop_reason" text not null,
  "primary_failure_family" text,
  "primary_failure_code" text,
  "primary_failure_summary" text,
  "imported_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
create table "jobs" (
  "id" uuid primary key default gen_random_uuid() not null,
  "run_id" uuid not null,
  "source_job_id" text,
  "state" "job_state" not null,
  "verdict_class" "evaluation_verdict_class" not null,
  "stop_reason" text not null,
  "primary_failure_family" text,
  "primary_failure_code" text,
  "primary_failure_summary" text,
  "imported_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
create table "attempts" (
  "id" uuid primary key default gen_random_uuid() not null,
  "run_id" uuid not null,
  "job_id" uuid not null,
  "source_attempt_id" text not null,
  "state" "attempt_state" not null,
  "verdict_class" "evaluation_verdict_class" not null,
  "verifier_result" text not null,
  "benchmark_package_digest" text not null,
  "lane_id" text not null,
  "prompt_package_digest" text not null,
  "prompt_protocol_version" text not null,
  "provider_family" text not null,
  "auth_mode" text not null,
  "model_config_id" text not null,
  "model_snapshot_id" text not null,
  "run_mode" text not null,
  "tool_profile" text not null,
  "harness_revision" text not null,
  "verifier_version" text not null,
  "stop_reason" text not null,
  "candidate_digest" text not null,
  "verdict_digest" text not null,
  "environment_digest" text not null,
  "artifact_manifest_digest" text not null,
  "bundle_digest" text not null,
  "primary_failure_family" text,
  "primary_failure_code" text,
  "primary_failure_summary" text,
  "failure_classification" jsonb,
  "verifier_verdict" jsonb not null,
  "usage_summary" jsonb,
  "imported_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
create table "artifacts" (
  "id" uuid primary key default gen_random_uuid() not null,
  "artifact_class_id" "artifact_class" not null,
  "owner_scope" "artifact_owner_scope" not null,
  "run_id" uuid,
  "job_id" uuid,
  "attempt_id" uuid,
  "benchmark_version_id" text,
  "export_id" text,
  "relative_path" text not null,
  "required_for_ingest" boolean not null,
  "artifact_manifest_digest" text,
  "storage_provider" "artifact_storage_provider" not null,
  "bucket_name" text not null,
  "object_key" text not null,
  "prefix_family" "artifact_prefix_family" not null,
  "sha256" text not null,
  "byte_size" integer not null,
  "media_type" text,
  "content_encoding" text,
  "provider_etag" text,
  "lifecycle_state" "artifact_lifecycle_state" not null,
  "registered_at" timestamp with time zone default now() not null,
  "finalized_at" timestamp with time zone,
  "last_verified_at" timestamp with time zone,
  "missing_detected_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
alter table "jobs" add constraint "jobs_run_id_runs_id_fk" foreign key ("run_id") references "public"."runs"("id") on delete cascade on update no action;
--> statement-breakpoint
alter table "attempts" add constraint "attempts_run_id_runs_id_fk" foreign key ("run_id") references "public"."runs"("id") on delete cascade on update no action;
--> statement-breakpoint
alter table "attempts" add constraint "attempts_job_id_jobs_id_fk" foreign key ("job_id") references "public"."jobs"("id") on delete cascade on update no action;
--> statement-breakpoint
alter table "artifacts" add constraint "artifacts_run_id_runs_id_fk" foreign key ("run_id") references "public"."runs"("id") on delete cascade on update no action;
--> statement-breakpoint
alter table "artifacts" add constraint "artifacts_job_id_jobs_id_fk" foreign key ("job_id") references "public"."jobs"("id") on delete cascade on update no action;
--> statement-breakpoint
alter table "artifacts" add constraint "artifacts_attempt_id_attempts_id_fk" foreign key ("attempt_id") references "public"."attempts"("id") on delete cascade on update no action;
--> statement-breakpoint
create unique index "runs_source_run_id_unique" on "runs" using btree ("source_run_id");
--> statement-breakpoint
create unique index "runs_bundle_digest_unique" on "runs" using btree ("bundle_digest");
--> statement-breakpoint
create index "runs_state_idx" on "runs" using btree ("state");
--> statement-breakpoint
create index "runs_verdict_class_idx" on "runs" using btree ("verdict_class");
--> statement-breakpoint
create index "runs_benchmark_digest_idx" on "runs" using btree ("benchmark_package_digest");
--> statement-breakpoint
create index "runs_run_config_digest_idx" on "runs" using btree ("run_config_digest");
--> statement-breakpoint
create index "jobs_run_id_idx" on "jobs" using btree ("run_id");
--> statement-breakpoint
create index "jobs_state_idx" on "jobs" using btree ("state");
--> statement-breakpoint
create index "jobs_source_job_id_idx" on "jobs" using btree ("source_job_id");
--> statement-breakpoint
create index "attempts_run_id_idx" on "attempts" using btree ("run_id");
--> statement-breakpoint
create index "attempts_job_id_idx" on "attempts" using btree ("job_id");
--> statement-breakpoint
create index "attempts_state_idx" on "attempts" using btree ("state");
--> statement-breakpoint
create unique index "attempts_source_attempt_id_unique" on "attempts" using btree ("source_attempt_id");
--> statement-breakpoint
create unique index "attempts_bundle_digest_unique" on "attempts" using btree ("bundle_digest");
--> statement-breakpoint
create unique index "artifacts_storage_locator_unique" on "artifacts" using btree ("storage_provider", "bucket_name", "object_key");
--> statement-breakpoint
create unique index "artifacts_attempt_relative_path_unique" on "artifacts" using btree ("attempt_id", "artifact_class_id", "relative_path") where "artifacts"."attempt_id" is not null;
--> statement-breakpoint
create index "artifacts_run_id_idx" on "artifacts" using btree ("run_id");
--> statement-breakpoint
create index "artifacts_attempt_id_lifecycle_state_idx" on "artifacts" using btree ("attempt_id", "lifecycle_state");
--> statement-breakpoint
create index "artifacts_run_id_artifact_class_idx" on "artifacts" using btree ("run_id", "artifact_class_id");
--> statement-breakpoint
create index "artifacts_manifest_digest_idx" on "artifacts" using btree ("artifact_manifest_digest");
--> statement-breakpoint
create index "artifacts_sha256_idx" on "artifacts" using btree ("sha256");
