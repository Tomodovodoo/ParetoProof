import { relations, sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  jsonb,
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

export const accessRequestKindEnum = pgEnum("access_request_kind", [
  "access_request",
  "identity_recovery"
]);

export const identityProviderEnum = pgEnum("identity_provider", [
  "cloudflare_one_time_pin",
  "cloudflare_github",
  "cloudflare_google"
]);

export const auditActorKindEnum = pgEnum("audit_actor_kind", [
  "portal_user",
  "internal_service",
  "system_bootstrap"
]);

export const auditSubjectKindEnum = pgEnum("audit_subject_kind", [
  "access_request",
  "role_grant",
  "run",
  "user_identity"
]);

export const auditSeverityEnum = pgEnum("audit_severity", [
  "info",
  "warning",
  "critical"
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
    activeUserUnique: uniqueIndex("role_grants_active_user_unique")
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
    userIndex: index("role_grants_user_id_idx").on(table.userId),
    roleIndex: index("role_grants_role_idx").on(table.role)
  })
);

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    requestKind: accessRequestKindEnum("request_kind")
      .default("access_request")
      .notNull(),
    requestedRole: accessRoleEnum("requested_role").notNull(),
    status: accessRequestStatusEnum("status").default("pending").notNull(),
    rationale: text("rationale"),
    requestedIdentityProvider: identityProviderEnum("requested_identity_provider"),
    requestedIdentitySubject: text("requested_identity_subject"),
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
    requestedIdentitySubjectIndex: index("access_requests_requested_identity_subject_idx").on(
      table.requestedIdentitySubject
    ),
    statusIndex: index("access_requests_status_idx").on(table.status),
    activePendingEmailUnique: uniqueIndex("access_requests_active_pending_email_unique")
      .on(table.email)
      .where(sql`${table.status} = 'pending'`)
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

export const identityLinkIntents = pgTable(
  "identity_link_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetProvider: identityProviderEnum("target_provider").notNull(),
    redirectPath: text("redirect_path").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    activeUserProviderUnique: uniqueIndex("identity_link_intents_active_user_provider_unique")
      .on(table.userId, table.targetProvider)
      .where(sql`${table.usedAt} is null`),
    expiresAtIndex: index("identity_link_intents_expires_at_idx").on(table.expiresAt),
    userIndex: index("identity_link_intents_user_id_idx").on(table.userId)
  })
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id").notNull(),
    actorKind: auditActorKindEnum("actor_kind").notNull(),
    subjectKind: auditSubjectKindEnum("subject_kind").notNull(),
    severity: auditSeverityEnum("severity").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    createdAtIndex: index("audit_events_created_at_idx").on(table.createdAt),
    eventIdIndex: index("audit_events_event_id_idx").on(table.eventId),
    targetUserIdIndex: index("audit_events_target_user_id_idx").on(table.targetUserId)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  identities: many(userIdentities),
  identityLinkIntents: many(identityLinkIntents),
  roleGrants: many(roleGrants),
  accessRequests: many(accessRequests),
  sessions: many(sessions),
  auditEventsAsActor: many(auditEvents, {
    relationName: "audit_event_actor"
  }),
  auditEventsAsTarget: many(auditEvents, {
    relationName: "audit_event_target"
  })
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one, many }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id]
  }),
  sessions: many(sessions)
}));

export const identityLinkIntentsRelations = relations(identityLinkIntents, ({ one }) => ({
  user: one(users, {
    fields: [identityLinkIntents.userId],
    references: [users.id]
  })
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

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actorUser: one(users, {
    fields: [auditEvents.actorUserId],
    references: [users.id],
    relationName: "audit_event_actor"
  }),
  targetUser: one(users, {
    fields: [auditEvents.targetUserId],
    references: [users.id],
    relationName: "audit_event_target"
  })
}));
