ALTER TYPE "public"."audit_subject_kind" ADD VALUE IF NOT EXISTS 'benchmark_release';
--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE IF NOT EXISTS 'benchmark_version';
--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE IF NOT EXISTS 'benchmark_workflow';
--> statement-breakpoint
CREATE TYPE "public"."repo_sync_status" AS ENUM('proposed', 'pr_open', 'merged', 'rejected', 'superseded');
--> statement-breakpoint
CREATE TYPE "public"."package_freeze_status" AS ENUM('active', 'withdrawn', 'superseded');
--> statement-breakpoint
CREATE TYPE "public"."benchmark_version_launchability" AS ENUM('internal_only', 'launchable', 'withdrawn');
--> statement-breakpoint
CREATE TYPE "public"."benchmark_release_status" AS ENUM('draft', 'approved', 'published', 'withdrawn');
--> statement-breakpoint
CREATE TYPE "public"."benchmark_release_visibility" AS ENUM('internal_only', 'held_out', 'public');
--> statement-breakpoint
CREATE TABLE "repo_sync_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_package_candidate_id" text,
	"repo_owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"target_repo_path" text NOT NULL,
	"pull_request_number" integer,
	"pull_request_url" text,
	"merge_commit_sha" text,
	"status" "repo_sync_status" DEFAULT 'proposed' NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"last_updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_freezes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_sync_record_id" uuid NOT NULL,
	"math_package_candidate_id" text,
	"package_id" text NOT NULL,
	"package_version" text NOT NULL,
	"package_digest" text NOT NULL,
	"benchmark_family" text NOT NULL,
	"repo_commit_sha" text NOT NULL,
	"repo_tree_path" text NOT NULL,
	"status" "package_freeze_status" DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_versions" (
	"benchmark_version_id" text PRIMARY KEY NOT NULL,
	"package_freeze_id" uuid NOT NULL,
	"package_id" text NOT NULL,
	"package_version" text NOT NULL,
	"package_digest" text NOT NULL,
	"benchmark_family" text NOT NULL,
	"scope_label" text NOT NULL,
	"item_set_definition" jsonb,
	"launchability" "benchmark_version_launchability" DEFAULT 'internal_only' NOT NULL,
	"display_label" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_releases" (
	"benchmark_release_id" text PRIMARY KEY NOT NULL,
	"benchmark_version_id" text NOT NULL,
	"release_label" text NOT NULL,
	"status" "benchmark_release_status" DEFAULT 'draft' NOT NULL,
	"visibility" "benchmark_release_visibility" DEFAULT 'internal_only' NOT NULL,
	"methodology_artifact_refs" jsonb NOT NULL,
	"summary_artifact_refs" jsonb NOT NULL,
	"summary_payload" jsonb,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_sync_records" ADD CONSTRAINT "repo_sync_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_sync_records" ADD CONSTRAINT "repo_sync_records_last_updated_by_user_id_users_id_fk" FOREIGN KEY ("last_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_freezes" ADD CONSTRAINT "package_freezes_repo_sync_record_id_repo_sync_records_id_fk" FOREIGN KEY ("repo_sync_record_id") REFERENCES "public"."repo_sync_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_freezes" ADD CONSTRAINT "package_freezes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "benchmark_versions" ADD CONSTRAINT "benchmark_versions_package_freeze_id_package_freezes_id_fk" FOREIGN KEY ("package_freeze_id") REFERENCES "public"."package_freezes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "benchmark_versions" ADD CONSTRAINT "benchmark_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "benchmark_releases" ADD CONSTRAINT "benchmark_releases_benchmark_version_id_benchmark_versions_benchmark_version_id_fk" FOREIGN KEY ("benchmark_version_id") REFERENCES "public"."benchmark_versions"("benchmark_version_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "benchmark_releases" ADD CONSTRAINT "benchmark_releases_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "benchmark_releases" ADD CONSTRAINT "benchmark_releases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "repo_sync_records_status_idx" ON "repo_sync_records" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "repo_sync_records_math_package_candidate_id_idx" ON "repo_sync_records" USING btree ("math_package_candidate_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_sync_records_repo_pr_unique" ON "repo_sync_records" USING btree ("repo_owner","repo_name","pull_request_number") WHERE "repo_sync_records"."pull_request_number" is not null;
--> statement-breakpoint
CREATE INDEX "package_freezes_repo_sync_record_id_idx" ON "package_freezes" USING btree ("repo_sync_record_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "package_freezes_package_digest_unique" ON "package_freezes" USING btree ("package_digest");
--> statement-breakpoint
CREATE INDEX "package_freezes_math_package_candidate_id_idx" ON "package_freezes" USING btree ("math_package_candidate_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_versions_package_freeze_id_unique" ON "benchmark_versions" USING btree ("package_freeze_id");
--> statement-breakpoint
CREATE INDEX "benchmark_versions_launchability_idx" ON "benchmark_versions" USING btree ("launchability");
--> statement-breakpoint
CREATE INDEX "benchmark_versions_package_digest_idx" ON "benchmark_versions" USING btree ("package_digest");
--> statement-breakpoint
CREATE INDEX "benchmark_releases_benchmark_version_id_idx" ON "benchmark_releases" USING btree ("benchmark_version_id");
--> statement-breakpoint
CREATE INDEX "benchmark_releases_status_idx" ON "benchmark_releases" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "benchmark_releases_status_visibility_published_at_idx" ON "benchmark_releases" USING btree ("status","visibility","published_at");
