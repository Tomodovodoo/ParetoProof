import { z } from "zod";

function normalizeOptionalRedirect(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value;
}

export const portalIdentityProviderSchema = z.enum([
  "cloudflare_google",
  "cloudflare_github",
  "cloudflare_one_time_pin"
]);

export const portalLinkableIdentityProviderSchema = z.enum([
  "cloudflare_google",
  "cloudflare_github"
]);

export const portalRoleSchema = z.enum(["admin", "collaborator", "helper"]);

export const portalAccessStatusSchema = z.enum(["approved", "pending", "denied"]);

export const portalAccessDeniedReasonSchema = z.enum([
  "access_request_required",
  "identity_recovery_required",
  "rejected_or_withdrawn",
  "unknown_identity"
]);

export const portalProfileIdentitySchema = z.object({
  createdAt: z.string(),
  current: z.boolean(),
  id: z.string().uuid(),
  lastSeenAt: z.string(),
  provider: portalIdentityProviderSchema,
  providerEmail: z.string().email().nullable()
});

export const portalProfileSchema = z.object({
  createdAt: z.string().nullable(),
  displayName: z.string().nullable(),
  email: z.string().email().nullable(),
  identities: z.array(portalProfileIdentitySchema),
  linkedUserId: z.string().uuid().nullable(),
  updatedAt: z.string().nullable()
});

export const portalProfileResponseSchema = z.object({
  profile: portalProfileSchema
});

const portalApprovedAccessResponseSchema = z.object({
  email: z.string().email(),
  role: portalRoleSchema,
  status: z.literal("approved")
}).passthrough();

const portalPendingAccessResponseSchema = z.object({
  email: z.string().email().nullable(),
  status: z.literal("pending")
}).passthrough();

const portalDeniedAccessResponseSchema = z.object({
  email: z.string().email().nullable(),
  reason: portalAccessDeniedReasonSchema,
  status: z.literal("denied")
}).passthrough();

export const portalMeResponseSchema = z.object({
  access: z.discriminatedUnion("status", [
    portalApprovedAccessResponseSchema,
    portalPendingAccessResponseSchema,
    portalDeniedAccessResponseSchema
  ]),
  identity: z.object({
    provider: portalIdentityProviderSchema.nullable()
  }).passthrough().nullable()
});

export const portalProfileUpdateInputSchema = z.object({
  displayName: z.union([z.string().trim().max(80), z.null()]).transform((value: string | null) => {
    if (!value) {
      return null;
    }

    return value;
  })
});

export const portalProfileLinkIntentInputSchema = z.object({
  provider: portalLinkableIdentityProviderSchema,
  redirectPath: z.string().trim().max(500).nullish().transform(normalizeOptionalRedirect)
});

export const portalSessionRedirectInputSchema = z.object({
  redirect: z.string().trim().max(500).nullish().transform(normalizeOptionalRedirect)
});

export const portalSessionRedirectRequestBodySchema = portalSessionRedirectInputSchema.optional();

export const portalSessionFinalizeResponseSchema = z.object({
  redirectTo: z.string().url()
});

export const portalProfileLinkIntentSchema = z.object({
  expiresAt: z.string(),
  provider: portalLinkableIdentityProviderSchema,
  startUrl: z.string().url()
});

export const portalProfileLinkIntentResponseSchema = z.object({
  intent: portalProfileLinkIntentSchema
});
