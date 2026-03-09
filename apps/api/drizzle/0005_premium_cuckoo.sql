update "users"
set "email" = lower(btrim("email"))
where "email" <> lower(btrim("email"));

update "access_requests"
set "email" = lower(btrim("email"))
where "email" <> lower(btrim("email"));

update "user_identities"
set "provider_email" = lower(btrim("provider_email"))
where "provider_email" is not null
  and "provider_email" <> lower(btrim("provider_email"));

alter table "users"
add constraint "users_email_normalized_check"
check ("email" = lower(btrim("email")));

alter table "access_requests"
add constraint "access_requests_email_normalized_check"
check ("email" = lower(btrim("email")));

alter table "user_identities"
add constraint "user_identities_provider_email_normalized_check"
check ("provider_email" is null or "provider_email" = lower(btrim("provider_email")));
