create type "public"."access_request_kind" as enum('access_request', 'identity_recovery');
--> statement-breakpoint

alter table "access_requests"
add column "request_kind" "access_request_kind" default 'access_request' not null;
--> statement-breakpoint

alter table "access_requests"
add column "requested_identity_provider" "identity_provider";
--> statement-breakpoint

alter table "access_requests"
add column "requested_identity_subject" text;
--> statement-breakpoint

create index "access_requests_requested_identity_subject_idx"
on "access_requests" using btree ("requested_identity_subject");
