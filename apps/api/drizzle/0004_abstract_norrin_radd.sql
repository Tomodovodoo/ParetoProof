CREATE UNIQUE INDEX "role_grants_active_user_unique"
ON "role_grants" USING btree ("user_id")
WHERE "revoked_at" IS NULL;
