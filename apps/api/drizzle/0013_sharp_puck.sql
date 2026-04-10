DROP INDEX "user_identities_provider_subject_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_subject_unique" ON "user_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
DROP INDEX "access_requests_requested_identity_subject_idx";--> statement-breakpoint
CREATE INDEX "access_requests_requested_identity_subject_idx" ON "access_requests" USING btree ("requested_identity_provider","requested_identity_subject");
