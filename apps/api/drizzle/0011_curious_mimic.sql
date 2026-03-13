CREATE TYPE "public"."worker_execution_phase" AS ENUM('prepare', 'generate', 'tool', 'compile', 'verify', 'finalize', 'cancel');
--> statement-breakpoint
CREATE TYPE "public"."worker_execution_event_kind" AS ENUM('attempt_started', 'compile_started', 'compile_succeeded', 'compile_failed', 'compile_repair_requested', 'compile_repair_applied', 'verifier_started', 'verifier_passed', 'verifier_failed', 'verifier_repair_requested', 'verifier_repair_applied', 'budget_exhausted', 'artifact_manifest_written', 'bundle_finalized');
--> statement-breakpoint
CREATE TABLE "worker_attempt_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"phase" "worker_execution_phase" NOT NULL,
	"event_kind" "worker_execution_event_kind" NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_attempt_events" ADD CONSTRAINT "worker_attempt_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_attempt_events" ADD CONSTRAINT "worker_attempt_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_attempt_events" ADD CONSTRAINT "worker_attempt_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_attempt_events" ADD CONSTRAINT "worker_attempt_events_lease_id_worker_job_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."worker_job_leases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_attempt_events_attempt_sequence_unique" ON "worker_attempt_events" USING btree ("attempt_id","sequence");
--> statement-breakpoint
CREATE INDEX "worker_attempt_events_attempt_recorded_at_idx" ON "worker_attempt_events" USING btree ("attempt_id","recorded_at");
--> statement-breakpoint
CREATE INDEX "worker_attempt_events_lease_id_idx" ON "worker_attempt_events" USING btree ("lease_id");
