ALTER TABLE "access_requests" ALTER COLUMN "requested_role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "role_grants" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."access_role";--> statement-breakpoint
CREATE TYPE "public"."access_role" AS ENUM('admin', 'collaborator', 'helper');--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "requested_role" SET DATA TYPE "public"."access_role" USING "requested_role"::"public"."access_role";--> statement-breakpoint
ALTER TABLE "role_grants" ALTER COLUMN "role" SET DATA TYPE "public"."access_role" USING "role"::"public"."access_role";
