create table "identity_link_intents" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null,
  "target_provider" "identity_provider" not null,
  "redirect_path" text not null,
  "expires_at" timestamp with time zone not null,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
alter table "identity_link_intents" add constraint "identity_link_intents_user_id_users_id_fk" foreign key ("user_id") references "public"."users"("id") on delete cascade on update no action;
--> statement-breakpoint
create unique index "identity_link_intents_active_user_provider_unique" on "identity_link_intents" using btree ("user_id","target_provider") where "identity_link_intents"."used_at" is null;
--> statement-breakpoint
create index "identity_link_intents_expires_at_idx" on "identity_link_intents" using btree ("expires_at");
--> statement-breakpoint
create index "identity_link_intents_user_id_idx" on "identity_link_intents" using btree ("user_id");
