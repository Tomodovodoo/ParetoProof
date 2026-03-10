import { z } from "zod";

export const portalIdentityProviderSchema = z.enum([
  "cloudflare_google",
  "cloudflare_github",
  "cloudflare_one_time_pin"
]);

export const portalLinkableIdentityProviderSchema = z.enum([
  "cloudflare_google",
  "cloudflare_github"
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

export const portalProfileUpdateInputSchema = z.object({
  displayName: z.string().trim().max(80).nullish().transform((value) => {
    if (!value) {
      return null;
    }

    return value;
  })
});

export const portalProfileLinkIntentInputSchema = z.object({
  provider: portalLinkableIdentityProviderSchema,
  redirectPath: z.string().trim().max(500).nullish().transform((value) => {
    if (!value) {
      return null;
    }

    return value;
  })
});

export const portalProfileLinkIntentSchema = z.object({
  expiresAt: z.string(),
  provider: portalLinkableIdentityProviderSchema,
  startUrl: z.string().url()
});
