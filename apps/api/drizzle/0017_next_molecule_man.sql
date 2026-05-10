CREATE TYPE "public"."math_artifact_backing_type" AS ENUM('uploaded_artifact', 'generated_artifact', 'repo_linked_reference');--> statement-breakpoint
CREATE TYPE "public"."math_artifact_subject_type" AS ENUM('question_revision', 'submission');--> statement-breakpoint
CREATE TYPE "public"."math_automation_summary_posture" AS ENUM('not_requested', 'pending', 'passed', 'failed', 'requires_review', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."math_package_candidate_posture" AS ENUM('proposed', 'review_ready', 'repo_synced', 'frozen', 'version_linked', 'release_linked', 'rejected', 'superseded', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."math_package_candidate_source_type" AS ENUM('question_revision', 'submission');--> statement-breakpoint
CREATE TYPE "public"."math_question_posture" AS ENUM('draft', 'active', 'superseded', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."math_question_revision_posture" AS ENUM('draft', 'reviewable', 'accepted', 'rejected', 'superseded', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."math_release_link_posture" AS ENUM('planned', 'version_linked', 'release_linked', 'published', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."math_review_assignment_role" AS ENUM('primary', 'secondary', 'observer');--> statement-breakpoint
CREATE TYPE "public"."math_review_assignment_state" AS ENUM('active', 'completed', 'recused', 'reassigned', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."math_review_checklist_state" AS ENUM('open', 'satisfied', 'blocked', 'waived', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."math_review_kind" AS ENUM('triage', 'peer_review', 'editor_review', 'release_decision');--> statement-breakpoint
CREATE TYPE "public"."math_review_record_posture" AS ENUM('open', 'decided', 'superseded', 'closed');--> statement-breakpoint
CREATE TYPE "public"."math_review_round_posture" AS ENUM('open', 'decided', 'superseded', 'closed');--> statement-breakpoint
CREATE TYPE "public"."math_review_subject_type" AS ENUM('question_revision', 'submission', 'package_candidate');--> statement-breakpoint
CREATE TYPE "public"."math_submission_posture" AS ENUM('draft', 'submitted', 'automation_complete', 'human_review_required', 'accepted', 'rejected', 'withdrawn', 'superseded');--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'math_package_candidate' BEFORE 'role_grant';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'math_question' BEFORE 'role_grant';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'math_question_revision' BEFORE 'role_grant';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'math_release_link' BEFORE 'role_grant';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'math_review_record' BEFORE 'role_grant';--> statement-breakpoint
ALTER TYPE "public"."audit_subject_kind" ADD VALUE 'math_submission' BEFORE 'role_grant';--> statement-breakpoint
CREATE TABLE "math_artifact_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "math_artifact_subject_type" NOT NULL,
	"math_question_revision_id" uuid,
	"math_submission_id" uuid,
	"artifact_role" text NOT NULL,
	"backing_type" "math_artifact_backing_type" NOT NULL,
	"artifact_id" uuid,
	"content_digest" text,
	"filename" text NOT NULL,
	"path_hint" text,
	"media_type" text,
	"backing_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "math_artifact_refs_subject_shape_check" CHECK ((
        "math_artifact_refs"."subject_type" = 'question_revision'
        and "math_artifact_refs"."math_question_revision_id" is not null
        and "math_artifact_refs"."math_submission_id" is null
      ) or (
        "math_artifact_refs"."subject_type" = 'submission'
        and "math_artifact_refs"."math_question_revision_id" is null
        and "math_artifact_refs"."math_submission_id" is not null
      )),
	CONSTRAINT "math_artifact_refs_backing_locator_check" CHECK ("math_artifact_refs"."artifact_id" is not null or "math_artifact_refs"."content_digest" is not null),
	CONSTRAINT "math_artifact_refs_repo_linked_metadata_check" CHECK ("math_artifact_refs"."backing_type" <> 'repo_linked_reference' or "math_artifact_refs"."backing_metadata" <> '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "math_package_candidates" (
	"math_package_candidate_id" text PRIMARY KEY NOT NULL,
	"source_type" "math_package_candidate_source_type" NOT NULL,
	"math_question_revision_id" uuid,
	"math_submission_id" uuid,
	"math_question_id" uuid NOT NULL,
	"posture" "math_package_candidate_posture" DEFAULT 'proposed' NOT NULL,
	"proposed_package_id" text NOT NULL,
	"proposed_package_version" text,
	"created_from_review_record_id" uuid,
	"latest_review_record_id" uuid,
	"linked_benchmark_version_id" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "math_package_candidates_source_shape_check" CHECK ((
        "math_package_candidates"."source_type" = 'question_revision'
        and "math_package_candidates"."math_question_revision_id" is not null
        and "math_package_candidates"."math_submission_id" is null
      ) or (
        "math_package_candidates"."source_type" = 'submission'
        and "math_package_candidates"."math_question_revision_id" is null
        and "math_package_candidates"."math_submission_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "math_question_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_question_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"author_user_id" uuid,
	"posture" "math_question_revision_posture" DEFAULT 'draft' NOT NULL,
	"statement_payload" jsonb NOT NULL,
	"formal_statement_payload" jsonb,
	"provenance_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"benchmark_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supersedes_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "math_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"question_family" text NOT NULL,
	"lane_id" text,
	"posture" "math_question_posture" DEFAULT 'draft' NOT NULL,
	"owner_user_id" uuid,
	"current_head_revision_id" uuid,
	"current_accepted_revision_id" uuid,
	"latest_active_package_candidate_id" text,
	"latest_linked_benchmark_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "math_release_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_question_id" uuid NOT NULL,
	"math_package_candidate_id" text NOT NULL,
	"benchmark_version_id" text,
	"benchmark_release_id" text,
	"posture" "math_release_link_posture" DEFAULT 'planned' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "math_release_links_linkage_shape_check" CHECK ((
        "math_release_links"."posture" in ('planned', 'withdrawn')
      ) or (
        "math_release_links"."posture" = 'version_linked'
        and "math_release_links"."benchmark_version_id" is not null
      ) or (
        "math_release_links"."posture" in ('release_linked', 'published')
        and "math_release_links"."benchmark_release_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "math_review_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_review_round_id" uuid NOT NULL,
	"assignee_user_id" uuid,
	"assignment_role" "math_review_assignment_role" NOT NULL,
	"state" "math_review_assignment_state" DEFAULT 'active' NOT NULL,
	"assigned_by_user_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text
);
--> statement-breakpoint
CREATE TABLE "math_review_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_review_round_id" uuid NOT NULL,
	"checklist_family" text NOT NULL,
	"checklist_version" text NOT NULL,
	"item_key" text NOT NULL,
	"state" "math_review_checklist_state" DEFAULT 'open' NOT NULL,
	"rationale" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "math_review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_review_round_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"anchor_payload" jsonb,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "math_review_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "math_review_subject_type" NOT NULL,
	"math_question_revision_id" uuid,
	"math_submission_id" uuid,
	"math_package_candidate_id" text,
	"review_kind" "math_review_kind" NOT NULL,
	"posture" "math_review_record_posture" DEFAULT 'open' NOT NULL,
	"opened_by_user_id" uuid,
	"current_round_id" uuid,
	"final_decision_actor_user_id" uuid,
	"final_decision" text,
	"final_decision_summary" text,
	"final_decision_payload" jsonb,
	"escalation_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "math_review_records_subject_shape_check" CHECK ((
        "math_review_records"."subject_type" = 'question_revision'
        and "math_review_records"."math_question_revision_id" is not null
        and "math_review_records"."math_submission_id" is null
        and "math_review_records"."math_package_candidate_id" is null
      ) or (
        "math_review_records"."subject_type" = 'submission'
        and "math_review_records"."math_question_revision_id" is null
        and "math_review_records"."math_submission_id" is not null
        and "math_review_records"."math_package_candidate_id" is null
      ) or (
        "math_review_records"."subject_type" = 'package_candidate'
        and "math_review_records"."math_question_revision_id" is null
        and "math_review_records"."math_submission_id" is null
        and "math_review_records"."math_package_candidate_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "math_review_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_review_record_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"posture" "math_review_round_posture" DEFAULT 'open' NOT NULL,
	"opened_by_user_id" uuid,
	"closed_by_user_id" uuid,
	"decision" text,
	"decision_summary" text,
	"decision_payload" jsonb,
	"escalation_note" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "math_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"math_question_id" uuid NOT NULL,
	"math_question_revision_id" uuid NOT NULL,
	"submitting_user_id" uuid,
	"submission_kind" text NOT NULL,
	"posture" "math_submission_posture" DEFAULT 'draft' NOT NULL,
	"parent_submission_id" uuid,
	"primary_artifact_ref_id" uuid,
	"automation_summary_posture" "math_automation_summary_posture" DEFAULT 'not_requested' NOT NULL,
	"latest_review_record_id" uuid,
	"latest_package_candidate_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "math_question_revisions_id_question_unique" ON "math_question_revisions" USING btree ("id","math_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_submissions_id_question_unique" ON "math_submissions" USING btree ("id","math_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_package_candidates_id_question_unique" ON "math_package_candidates" USING btree ("math_package_candidate_id","math_question_id");--> statement-breakpoint
ALTER TABLE "math_artifact_refs" ADD CONSTRAINT "math_artifact_refs_math_question_revision_id_math_question_revisions_id_fk" FOREIGN KEY ("math_question_revision_id") REFERENCES "public"."math_question_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_artifact_refs" ADD CONSTRAINT "math_artifact_refs_math_submission_id_math_submissions_id_fk" FOREIGN KEY ("math_submission_id") REFERENCES "public"."math_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_artifact_refs" ADD CONSTRAINT "math_artifact_refs_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_math_question_revision_id_math_question_revisions_id_fk" FOREIGN KEY ("math_question_revision_id") REFERENCES "public"."math_question_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_math_submission_id_math_submissions_id_fk" FOREIGN KEY ("math_submission_id") REFERENCES "public"."math_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_math_question_id_math_questions_id_fk" FOREIGN KEY ("math_question_id") REFERENCES "public"."math_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_created_from_review_record_id_math_review_records_id_fk" FOREIGN KEY ("created_from_review_record_id") REFERENCES "public"."math_review_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_latest_review_record_id_math_review_records_id_fk" FOREIGN KEY ("latest_review_record_id") REFERENCES "public"."math_review_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_revision_question_fk" FOREIGN KEY ("math_question_revision_id","math_question_id") REFERENCES "public"."math_question_revisions"("id","math_question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_package_candidates" ADD CONSTRAINT "math_package_candidates_submission_question_fk" FOREIGN KEY ("math_submission_id","math_question_id") REFERENCES "public"."math_submissions"("id","math_question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_question_revisions" ADD CONSTRAINT "math_question_revisions_math_question_id_math_questions_id_fk" FOREIGN KEY ("math_question_id") REFERENCES "public"."math_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_question_revisions" ADD CONSTRAINT "math_question_revisions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_question_revisions" ADD CONSTRAINT "math_question_revisions_supersedes_revision_id_fk" FOREIGN KEY ("supersedes_revision_id") REFERENCES "public"."math_question_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_questions" ADD CONSTRAINT "math_questions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_release_links" ADD CONSTRAINT "math_release_links_math_question_id_math_questions_id_fk" FOREIGN KEY ("math_question_id") REFERENCES "public"."math_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_release_links" ADD CONSTRAINT "math_release_links_math_package_candidate_id_math_package_candidates_math_package_candidate_id_fk" FOREIGN KEY ("math_package_candidate_id") REFERENCES "public"."math_package_candidates"("math_package_candidate_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_release_links" ADD CONSTRAINT "math_release_links_benchmark_version_id_benchmark_versions_benchmark_version_id_fk" FOREIGN KEY ("benchmark_version_id") REFERENCES "public"."benchmark_versions"("benchmark_version_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_release_links" ADD CONSTRAINT "math_release_links_benchmark_release_id_benchmark_releases_benchmark_release_id_fk" FOREIGN KEY ("benchmark_release_id") REFERENCES "public"."benchmark_releases"("benchmark_release_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_release_links" ADD CONSTRAINT "math_release_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_release_links" ADD CONSTRAINT "math_release_links_candidate_question_fk" FOREIGN KEY ("math_package_candidate_id","math_question_id") REFERENCES "public"."math_package_candidates"("math_package_candidate_id","math_question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_assignments" ADD CONSTRAINT "math_review_assignments_math_review_round_id_math_review_rounds_id_fk" FOREIGN KEY ("math_review_round_id") REFERENCES "public"."math_review_rounds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_assignments" ADD CONSTRAINT "math_review_assignments_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_assignments" ADD CONSTRAINT "math_review_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_checklist_items" ADD CONSTRAINT "math_review_checklist_items_math_review_round_id_math_review_rounds_id_fk" FOREIGN KEY ("math_review_round_id") REFERENCES "public"."math_review_rounds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_checklist_items" ADD CONSTRAINT "math_review_checklist_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_comments" ADD CONSTRAINT "math_review_comments_math_review_round_id_math_review_rounds_id_fk" FOREIGN KEY ("math_review_round_id") REFERENCES "public"."math_review_rounds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_comments" ADD CONSTRAINT "math_review_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_comments" ADD CONSTRAINT "math_review_comments_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_records" ADD CONSTRAINT "math_review_records_math_question_revision_id_math_question_revisions_id_fk" FOREIGN KEY ("math_question_revision_id") REFERENCES "public"."math_question_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_records" ADD CONSTRAINT "math_review_records_math_submission_id_math_submissions_id_fk" FOREIGN KEY ("math_submission_id") REFERENCES "public"."math_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_records" ADD CONSTRAINT "math_review_records_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_records" ADD CONSTRAINT "math_review_records_final_decision_actor_user_id_users_id_fk" FOREIGN KEY ("final_decision_actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_rounds" ADD CONSTRAINT "math_review_rounds_math_review_record_id_math_review_records_id_fk" FOREIGN KEY ("math_review_record_id") REFERENCES "public"."math_review_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_rounds" ADD CONSTRAINT "math_review_rounds_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_review_rounds" ADD CONSTRAINT "math_review_rounds_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_submissions" ADD CONSTRAINT "math_submissions_math_question_id_math_questions_id_fk" FOREIGN KEY ("math_question_id") REFERENCES "public"."math_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_submissions" ADD CONSTRAINT "math_submissions_submitting_user_id_users_id_fk" FOREIGN KEY ("submitting_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_submissions" ADD CONSTRAINT "math_submissions_revision_question_fk" FOREIGN KEY ("math_question_revision_id","math_question_id") REFERENCES "public"."math_question_revisions"("id","math_question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "math_submissions" ADD CONSTRAINT "math_submissions_parent_submission_id_fk" FOREIGN KEY ("parent_submission_id") REFERENCES "public"."math_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "math_artifact_refs_question_revision_role_idx" ON "math_artifact_refs" USING btree ("math_question_revision_id","artifact_role");--> statement-breakpoint
CREATE INDEX "math_artifact_refs_submission_role_idx" ON "math_artifact_refs" USING btree ("math_submission_id","artifact_role");--> statement-breakpoint
CREATE INDEX "math_artifact_refs_artifact_id_idx" ON "math_artifact_refs" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "math_artifact_refs_content_digest_idx" ON "math_artifact_refs" USING btree ("content_digest");--> statement-breakpoint
CREATE INDEX "math_package_candidates_question_posture_idx" ON "math_package_candidates" USING btree ("math_question_id","posture");--> statement-breakpoint
CREATE INDEX "math_package_candidates_created_from_review_idx" ON "math_package_candidates" USING btree ("created_from_review_record_id");--> statement-breakpoint
CREATE INDEX "math_package_candidates_linked_benchmark_version_idx" ON "math_package_candidates" USING btree ("linked_benchmark_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_question_revisions_question_revision_unique" ON "math_question_revisions" USING btree ("math_question_id","revision_number");--> statement-breakpoint
CREATE INDEX "math_question_revisions_question_posture_idx" ON "math_question_revisions" USING btree ("math_question_id","posture");--> statement-breakpoint
CREATE INDEX "math_question_revisions_author_user_id_idx" ON "math_question_revisions" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_questions_slug_unique" ON "math_questions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "math_questions_family_posture_idx" ON "math_questions" USING btree ("question_family","posture");--> statement-breakpoint
CREATE INDEX "math_questions_owner_user_id_idx" ON "math_questions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "math_questions_current_head_revision_id_idx" ON "math_questions" USING btree ("current_head_revision_id");--> statement-breakpoint
CREATE INDEX "math_questions_current_accepted_revision_id_idx" ON "math_questions" USING btree ("current_accepted_revision_id");--> statement-breakpoint
CREATE INDEX "math_questions_latest_active_package_candidate_id_idx" ON "math_questions" USING btree ("latest_active_package_candidate_id");--> statement-breakpoint
CREATE INDEX "math_questions_latest_linked_benchmark_version_id_idx" ON "math_questions" USING btree ("latest_linked_benchmark_version_id");--> statement-breakpoint
CREATE INDEX "math_release_links_question_posture_idx" ON "math_release_links" USING btree ("math_question_id","posture");--> statement-breakpoint
CREATE INDEX "math_release_links_package_candidate_id_idx" ON "math_release_links" USING btree ("math_package_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "math_release_links_package_candidate_version_unique" ON "math_release_links" USING btree ("math_package_candidate_id","benchmark_version_id") WHERE "math_release_links"."benchmark_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "math_release_links_package_candidate_release_unique" ON "math_release_links" USING btree ("math_package_candidate_id","benchmark_release_id") WHERE "math_release_links"."benchmark_release_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "math_review_assignments_active_primary_unique" ON "math_review_assignments" USING btree ("math_review_round_id") WHERE "math_review_assignments"."assignment_role" = 'primary' and "math_review_assignments"."state" = 'active';--> statement-breakpoint
CREATE INDEX "math_review_assignments_assignee_state_assigned_at_idx" ON "math_review_assignments" USING btree ("assignee_user_id","state","assigned_at");--> statement-breakpoint
CREATE INDEX "math_review_assignments_round_state_idx" ON "math_review_assignments" USING btree ("math_review_round_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "math_review_checklist_items_round_item_unique" ON "math_review_checklist_items" USING btree ("math_review_round_id","checklist_family","checklist_version","item_key");--> statement-breakpoint
CREATE INDEX "math_review_checklist_items_round_state_idx" ON "math_review_checklist_items" USING btree ("math_review_round_id","state");--> statement-breakpoint
CREATE INDEX "math_review_comments_round_created_at_idx" ON "math_review_comments" USING btree ("math_review_round_id","created_at");--> statement-breakpoint
CREATE INDEX "math_review_comments_unresolved_round_idx" ON "math_review_comments" USING btree ("math_review_round_id") WHERE "math_review_comments"."resolved_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "math_review_records_question_revision_open_unique" ON "math_review_records" USING btree ("math_question_revision_id","review_kind") WHERE "math_review_records"."posture" = 'open' and "math_review_records"."subject_type" = 'question_revision';--> statement-breakpoint
CREATE UNIQUE INDEX "math_review_records_submission_open_unique" ON "math_review_records" USING btree ("math_submission_id","review_kind") WHERE "math_review_records"."posture" = 'open' and "math_review_records"."subject_type" = 'submission';--> statement-breakpoint
CREATE UNIQUE INDEX "math_review_records_package_candidate_open_unique" ON "math_review_records" USING btree ("math_package_candidate_id","review_kind") WHERE "math_review_records"."posture" = 'open' and "math_review_records"."subject_type" = 'package_candidate';--> statement-breakpoint
CREATE INDEX "math_review_records_kind_posture_updated_at_idx" ON "math_review_records" USING btree ("review_kind","posture","updated_at");--> statement-breakpoint
CREATE INDEX "math_review_records_opened_by_user_created_at_idx" ON "math_review_records" USING btree ("opened_by_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "math_review_rounds_record_round_unique" ON "math_review_rounds" USING btree ("math_review_record_id","round_number");--> statement-breakpoint
CREATE UNIQUE INDEX "math_review_rounds_active_record_unique" ON "math_review_rounds" USING btree ("math_review_record_id") WHERE "math_review_rounds"."posture" = 'open';--> statement-breakpoint
CREATE INDEX "math_submissions_question_created_at_idx" ON "math_submissions" USING btree ("math_question_id","created_at");--> statement-breakpoint
CREATE INDEX "math_submissions_revision_created_at_idx" ON "math_submissions" USING btree ("math_question_revision_id","created_at");--> statement-breakpoint
CREATE INDEX "math_submissions_submitting_user_created_at_idx" ON "math_submissions" USING btree ("submitting_user_id","created_at");--> statement-breakpoint
CREATE INDEX "math_submissions_posture_updated_at_idx" ON "math_submissions" USING btree ("posture","updated_at");--> statement-breakpoint
ALTER TABLE "package_freezes" ADD CONSTRAINT "package_freezes_math_package_candidate_id_math_package_candidates_math_package_candidate_id_fk" FOREIGN KEY ("math_package_candidate_id") REFERENCES "public"."math_package_candidates"("math_package_candidate_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_sync_records" ADD CONSTRAINT "repo_sync_records_math_package_candidate_id_math_package_candidates_math_package_candidate_id_fk" FOREIGN KEY ("math_package_candidate_id") REFERENCES "public"."math_package_candidates"("math_package_candidate_id") ON DELETE set null ON UPDATE no action;
