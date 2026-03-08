ALTER TABLE "sessions" DROP CONSTRAINT "sessions_identity_id_user_identities_id_fk";
--> statement-breakpoint
DROP INDEX "user_identities_provider_subject_unique";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_identity_owner_fk" FOREIGN KEY ("identity_id","user_id") REFERENCES "public"."user_identities"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_id_user_id_unique" ON "user_identities" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_subject_unique" ON "user_identities" USING btree ("provider_subject");