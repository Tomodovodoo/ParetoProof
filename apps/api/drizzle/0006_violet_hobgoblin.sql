with "ranked_pending_requests" as (
  select
    "id",
    row_number() over (
      partition by "email"
      order by "created_at" desc, "id" desc
    ) as "pending_rank"
  from "access_requests"
  where "status" = 'pending'
)
update "access_requests"
set
  "decision_note" = coalesce("decision_note", 'Superseded during pending-request deduplication.'),
  "status" = 'withdrawn'
where "id" in (
  select "id"
  from "ranked_pending_requests"
  where "pending_rank" > 1
);
--> statement-breakpoint

create unique index "access_requests_active_pending_email_unique"
on "access_requests" using btree ("email")
where "status" = 'pending';
