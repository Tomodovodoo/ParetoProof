CREATE TYPE "public"."audit_actor_kind" AS ENUM('portal_user', 'internal_service', 'system_bootstrap');--> statement-breakpoint
CREATE TYPE "public"."audit_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."audit_subject_kind" AS ENUM('access_request', 'role_grant', 'run', 'user_identity');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"actor_kind" "audit_actor_kind" NOT NULL,
	"subject_kind" "audit_subject_kind" NOT NULL,
	"severity" "audit_severity" NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_event_id_idx" ON "audit_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_user_id_idx" ON "audit_events" USING btree ("target_user_id");