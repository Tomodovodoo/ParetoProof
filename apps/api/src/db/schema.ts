import { relations } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const accessRoleEnum = pgEnum("access_role", [
  "admin",
  "collaborator",
  "helper"
]);

export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "approved",
  "rejected",
  "withdrawn"
]);

export const identityProviderEnum = pgEnum("identity_provider", [
  "cloudflare_one_time_pin",
  "cloudflare_github",
  "cloudflare_google"
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email)
  })
);

// A single contributor may later attach multiple Access-backed identities.
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: identityProviderEnum("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    providerEmail: text("provider_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    providerSubjectUnique: uniqueIndex("user_identities_provider_subject_unique").on(
      table.providerSubject
    ),
    idUserUnique: uniqueIndex("user_identities_id_user_id_unique").on(
      table.id,
      table.userId
    ),
    userIndex: index("user_identities_user_id_idx").on(table.userId)
  })
);

export const roleGrants = pgTable(
  "role_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: accessRoleEnum("role").notNull(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null"
    })
  },
  (table) => ({
    userIndex: index("role_grants_user_id_idx").on(table.userId),
    roleIndex: index("role_grants_role_idx").on(table.role)
  })
);

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    requestedRole: accessRoleEnum("requested_role").notNull(),
    status: accessRequestStatusEnum("status").default("pending").notNull(),
    rationale: text("rationale"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    emailIndex: index("access_requests_email_idx").on(table.email),
    statusIndex: index("access_requests_status_idx").on(table.status)
  })
);

// The live session handle should be stored outside Postgres; only its hash belongs here.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    identityOwnerForeignKey: foreignKey({
      columns: [table.identityId, table.userId],
      foreignColumns: [userIdentities.id, userIdentities.userId],
      name: "sessions_identity_owner_fk"
    }).onDelete("cascade"),
    tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    userIndex: index("sessions_user_id_idx").on(table.userId),
    identityIndex: index("sessions_identity_id_idx").on(table.identityId)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  identities: many(userIdentities),
  roleGrants: many(roleGrants),
  accessRequests: many(accessRequests),
  sessions: many(sessions)
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one, many }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id]
  }),
  sessions: many(sessions)
}));

export const roleGrantsRelations = relations(roleGrants, ({ one }) => ({
  user: one(users, {
    fields: [roleGrants.userId],
    references: [users.id]
  }),
  grantedByUser: one(users, {
    fields: [roleGrants.grantedByUserId],
    references: [users.id]
  }),
  revokedByUser: one(users, {
    fields: [roleGrants.revokedByUserId],
    references: [users.id]
  })
}));

export const accessRequestsRelations = relations(accessRequests, ({ one }) => ({
  requestedByUser: one(users, {
    fields: [accessRequests.requestedByUserId],
    references: [users.id]
  }),
  reviewedByUser: one(users, {
    fields: [accessRequests.reviewedByUserId],
    references: [users.id]
  })
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  }),
  identity: one(userIdentities, {
    fields: [sessions.identityId],
    references: [userIdentities.id]
  })
}));
