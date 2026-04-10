CREATE TYPE "public"."worker_instance_lifecycle_state" AS ENUM('registering', 'ready', 'claiming', 'running', 'draining', 'unhealthy', 'recovering', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."worker_pool_rollout_class" AS ENUM('stable', 'canary', 'quarantine');--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'worker_pool';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'worker_instance';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'worker_incident';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'worker_rollout';--> statement-breakpoint
CREATE TABLE "worker_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" text NOT NULL,
	"worker_pool_definition_id" uuid NOT NULL,
	"worker_runtime" "worker_runtime" NOT NULL,
	"worker_version" text NOT NULL,
	"current_lifecycle_state" "worker_instance_lifecycle_state" DEFAULT 'ready' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_claim_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"last_lease_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_pool_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_pool" text NOT NULL,
	"worker_runtime" "worker_runtime" NOT NULL,
	"default_rollout_class" "worker_pool_rollout_class" DEFAULT 'stable' NOT NULL,
	"ownership_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_job_leases" ADD COLUMN "worker_instance_id" uuid;--> statement-breakpoint
ALTER TABLE "worker_instances" ADD CONSTRAINT "worker_instances_worker_pool_definition_id_worker_pool_definitions_id_fk" FOREIGN KEY ("worker_pool_definition_id") REFERENCES "public"."worker_pool_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_instances_worker_id_unique" ON "worker_instances" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_instances_pool_state_idx" ON "worker_instances" USING btree ("worker_pool_definition_id","current_lifecycle_state");--> statement-breakpoint
CREATE INDEX "worker_instances_last_heartbeat_at_idx" ON "worker_instances" USING btree ("last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_pool_definitions_worker_pool_unique" ON "worker_pool_definitions" USING btree ("worker_pool");--> statement-breakpoint
CREATE INDEX "worker_pool_definitions_worker_runtime_idx" ON "worker_pool_definitions" USING btree ("worker_runtime");--> statement-breakpoint
ALTER TABLE "worker_job_leases" ADD CONSTRAINT "worker_job_leases_worker_instance_id_worker_instances_id_fk" FOREIGN KEY ("worker_instance_id") REFERENCES "public"."worker_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worker_job_leases_worker_instance_id_idx" ON "worker_job_leases" USING btree ("worker_instance_id");
