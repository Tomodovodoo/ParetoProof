create temporary table "__user_merge_map" as
with "normalized_users" as (
  select
    "id",
    "display_name",
    "created_at",
    lower(btrim("email")) as "normalized_email",
    row_number() over (
      partition by lower(btrim("email"))
      order by "created_at" asc, "id" asc
    ) as "normalized_rank"
  from "users"
)
select
  "losing"."id" as "source_user_id",
  "winning"."id" as "target_user_id",
  "losing"."display_name" as "source_display_name"
from "normalized_users" as "losing"
join "normalized_users" as "winning"
  on "winning"."normalized_email" = "losing"."normalized_email"
 and "winning"."normalized_rank" = 1
where "losing"."id" <> "winning"."id";
--> statement-breakpoint

create temporary table "__user_merge_group" as
select distinct
  "user_id",
  "canonical_user_id"
from (
  select
    "source_user_id" as "user_id",
    "target_user_id" as "canonical_user_id"
  from "__user_merge_map"

  union all

  select
    "target_user_id" as "user_id",
    "target_user_id" as "canonical_user_id"
  from "__user_merge_map"
) as "group_rows";
--> statement-breakpoint

update "users" as "target"
set
  "display_name" = "merge_source"."source_display_name",
  "updated_at" = now()
from (
  select distinct on ("target_user_id")
    "target_user_id",
    "source_display_name"
  from "__user_merge_map"
  where "source_display_name" is not null
  order by "target_user_id", "source_user_id"
) as "merge_source"
where "target"."id" = "merge_source"."target_user_id"
  and "target"."display_name" is null;
--> statement-breakpoint

delete from "sessions"
where "user_id" in (
  select "source_user_id"
  from "__user_merge_map"
);
--> statement-breakpoint

create temporary table "__active_role_grant_winner" as
select distinct on ("merge_group"."canonical_user_id")
  "role_grants"."id" as "role_grant_id",
  "merge_group"."canonical_user_id"
from "role_grants"
join "__user_merge_group" as "merge_group"
  on "merge_group"."user_id" = "role_grants"."user_id"
where "role_grants"."revoked_at" is null
order by
  "merge_group"."canonical_user_id",
  case "role_grants"."role"
    when 'admin' then 3
    when 'collaborator' then 2
    else 1
  end desc,
  "role_grants"."granted_at" asc,
  "role_grants"."id" asc;
--> statement-breakpoint

update "role_grants"
set "revoked_at" = now()
where "revoked_at" is null
  and "user_id" in (
    select "user_id"
    from "__user_merge_group"
  )
  and "id" not in (
    select "role_grant_id"
    from "__active_role_grant_winner"
  );
--> statement-breakpoint

update "role_grants" as "role_grants"
set "granted_by_user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "role_grants"."granted_by_user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

update "role_grants" as "role_grants"
set "revoked_by_user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "role_grants"."revoked_by_user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

update "role_grants" as "role_grants"
set "user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "role_grants"."user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

update "access_requests" as "access_requests"
set "requested_by_user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "access_requests"."requested_by_user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

update "access_requests" as "access_requests"
set "reviewed_by_user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "access_requests"."reviewed_by_user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

update "audit_events" as "audit_events"
set "actor_user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "audit_events"."actor_user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

update "audit_events" as "audit_events"
set "target_user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "audit_events"."target_user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

update "user_identities" as "user_identities"
set "user_id" = "merge_map"."target_user_id"
from "__user_merge_map" as "merge_map"
where "user_identities"."user_id" = "merge_map"."source_user_id";
--> statement-breakpoint

delete from "users"
where "id" in (
  select "source_user_id"
  from "__user_merge_map"
);
--> statement-breakpoint

update "users"
set "email" = lower(btrim("email"))
where "email" <> lower(btrim("email"));
--> statement-breakpoint

update "access_requests"
set "email" = lower(btrim("email"))
where "email" <> lower(btrim("email"));
--> statement-breakpoint

update "user_identities"
set "provider_email" = lower(btrim("provider_email"))
where "provider_email" is not null
  and "provider_email" <> lower(btrim("provider_email"));
--> statement-breakpoint

alter table "users"
add constraint "users_email_normalized_check"
check ("email" = lower(btrim("email")));
--> statement-breakpoint

alter table "access_requests"
add constraint "access_requests_email_normalized_check"
check ("email" = lower(btrim("email")));
--> statement-breakpoint

alter table "user_identities"
add constraint "user_identities_provider_email_normalized_check"
check ("provider_email" is null or "provider_email" = lower(btrim("provider_email")));
