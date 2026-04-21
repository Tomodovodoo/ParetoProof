CREATE TYPE "public"."math_launch_mode" AS ENUM('hosted', 'local_connected', 'offline_export');--> statement-breakpoint
CREATE TYPE "public"."math_launch_status" AS ENUM('hosted_enqueued', 'local_bootstrap_issued', 'local_bootstrap_redeemed', 'offline_exported', 'offline_ingested');--> statement-breakpoint
CREATE TABLE "math_launch_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_question_id" text NOT NULL,
	"benchmark_version_id" text NOT NULL,
	"launch_mode" "math_launch_mode" NOT NULL,
	"status" "math_launch_status" NOT NULL,
	"requested_by_user_id" uuid,
	"run_id" uuid,
	"config_source_run_id" text NOT NULL,
	"source_run_id" text NOT NULL,
	"source_job_id" text,
	"source_attempt_id" text NOT NULL,
	"benchmark_package_id" text NOT NULL,
	"benchmark_package_version" text NOT NULL,
	"benchmark_package_digest" text NOT NULL,
	"benchmark_item_id" text NOT NULL,
	"lane_id" text NOT NULL,
	"prompt_protocol_version" text NOT NULL,
	"prompt_package_digest" text NOT NULL,
	"run_mode" text NOT NULL,
	"tool_profile" text NOT NULL,
	"harness_revision" text NOT NULL,
	"verifier_version" text NOT NULL,
	"provider_family" text NOT NULL,
	"auth_mode" text NOT NULL,
	"model_config_id" text NOT NULL,
	"model_snapshot_id" text NOT NULL,
	"ingested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "math_runner_bootstrap_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_launch_record_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"session_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "math_launch_records" ADD CONSTRAINT "math_launch_records_benchmark_version_id_benchmark_versions_benchmark_version_id_fk" FOREIGN KEY ("benchmark_version_id") REFERENCES "public"."benchmark_versions"("benchmark_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_launch_records" ADD CONSTRAINT "math_launch_records_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_launch_records" ADD CONSTRAINT "math_launch_records_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_runner_bootstrap_sessions" ADD CONSTRAINT "math_runner_bootstrap_sessions_math_launch_record_id_math_launch_records_id_fk" FOREIGN KEY ("math_launch_record_id") REFERENCES "public"."math_launch_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_runner_bootstrap_sessions" ADD CONSTRAINT "math_runner_bootstrap_sessions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "math_launch_records_question_idx" ON "math_launch_records" USING btree ("math_question_id");--> statement-breakpoint
CREATE INDEX "math_launch_records_benchmark_version_id_idx" ON "math_launch_records" USING btree ("benchmark_version_id");--> statement-breakpoint
CREATE INDEX "math_launch_records_requested_by_user_id_idx" ON "math_launch_records" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "math_launch_records_status_idx" ON "math_launch_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "math_launch_records_source_run_id_unique" ON "math_launch_records" USING btree ("source_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_launch_records_source_attempt_id_unique" ON "math_launch_records" USING btree ("source_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_launch_records_run_id_unique" ON "math_launch_records" USING btree ("run_id") WHERE "math_launch_records"."run_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "math_runner_bootstrap_sessions_launch_unique" ON "math_runner_bootstrap_sessions" USING btree ("math_launch_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_runner_bootstrap_sessions_token_hash_unique" ON "math_runner_bootstrap_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "math_runner_bootstrap_sessions_expires_at_idx" ON "math_runner_bootstrap_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "math_runner_bootstrap_sessions_requested_by_user_id_idx" ON "math_runner_bootstrap_sessions" USING btree ("requested_by_user_id");