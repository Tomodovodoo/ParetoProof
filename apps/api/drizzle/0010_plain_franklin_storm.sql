CREATE TYPE "public"."worker_runtime" AS ENUM('local_docker', 'modal');
--> statement-breakpoint
CREATE TABLE "worker_job_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"worker_id" text NOT NULL,
	"worker_pool" text NOT NULL,
	"worker_runtime" "worker_runtime" NOT NULL,
	"worker_version" text NOT NULL,
	"heartbeat_interval_seconds" integer NOT NULL,
	"heartbeat_timeout_seconds" integer NOT NULL,
	"last_event_sequence" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"job_token_hash" text NOT NULL,
	"job_token_expires_at" timestamp with time zone NOT NULL,
	"job_token_scopes" jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_job_leases" ADD CONSTRAINT "worker_job_leases_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_job_leases" ADD CONSTRAINT "worker_job_leases_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_job_leases" ADD CONSTRAINT "worker_job_leases_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_job_leases_active_job_unique" ON "worker_job_leases" USING btree ("job_id") WHERE "worker_job_leases"."revoked_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_job_leases_active_attempt_unique" ON "worker_job_leases" USING btree ("attempt_id") WHERE "worker_job_leases"."revoked_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_job_leases_job_token_hash_unique" ON "worker_job_leases" USING btree ("job_token_hash");
--> statement-breakpoint
CREATE INDEX "worker_job_leases_run_id_idx" ON "worker_job_leases" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "worker_job_leases_job_id_idx" ON "worker_job_leases" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX "worker_job_leases_attempt_id_idx" ON "worker_job_leases" USING btree ("attempt_id");
--> statement-breakpoint
CREATE INDEX "worker_job_leases_lease_expires_at_idx" ON "worker_job_leases" USING btree ("lease_expires_at");
