import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const nonEmptyStringArraySchema = z.array(nonEmptyStringSchema).min(1);

export const harnessSupportStatusSchema = z.enum([
  "supported",
  "internal_only",
  "deprecated",
  "retired"
]);

export const harnessRuntimeClassSchema = z.enum([
  "hosted_worker",
  "trusted_local_devbox",
  "noninteractive_execution",
  "offline_export"
]);

export const harnessImageRoleSchema = z.enum([
  "hosted_worker_image",
  "execution_image",
  "devbox_image"
]);

export const harnessImageDigestAuthoritySchema = z.enum(["publish_workflow_artifact"]);

export const harnessImageRefSchema = z.object({
  currentDigest: nonEmptyStringSchema.nullable(),
  digestAuthority: harnessImageDigestAuthoritySchema,
  notes: z.array(nonEmptyStringSchema).default([]),
  publishedByWorkflow: nonEmptyStringSchema,
  publishedImage: nonEmptyStringSchema,
  repository: nonEmptyStringSchema,
  role: harnessImageRoleSchema,
  target: nonEmptyStringSchema
});

const harnessImageRefsSchema = z.array(harnessImageRefSchema).min(1).superRefine((imageRefs, ctx) => {
  const seenRoles = new Set<string>();

  for (const [index, imageRef] of imageRefs.entries()) {
    if (seenRoles.has(imageRef.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate harness image role "${imageRef.role}" is not allowed.`,
        path: [index, "role"]
      });
      continue;
    }

    seenRoles.add(imageRef.role);
  }
});

export const harnessRegistryEntrySchema = z.object({
  authModes: nonEmptyStringArraySchema,
  benchmarkFamilies: nonEmptyStringArraySchema,
  familyId: nonEmptyStringSchema,
  harnessRevision: nonEmptyStringSchema,
  id: nonEmptyStringSchema,
  imageRefs: harnessImageRefsSchema,
  label: nonEmptyStringSchema,
  notes: z.array(nonEmptyStringSchema).default([]),
  providerFamilies: nonEmptyStringArraySchema,
  runModes: nonEmptyStringArraySchema,
  runtimeClass: harnessRuntimeClassSchema,
  summary: nonEmptyStringSchema,
  supportStatus: harnessSupportStatusSchema,
  toolProfiles: nonEmptyStringArraySchema
});

export const harnessRegistryCatalogSchema = z
  .object({
    items: z.array(harnessRegistryEntrySchema).min(1),
    version: z.literal(1)
  })
  .superRefine((catalog, ctx) => {
    const seenIds = new Set<string>();

    for (const [index, entry] of catalog.items.entries()) {
      if (seenIds.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate harness id "${entry.id}" is not allowed.`,
          path: ["items", index, "id"]
        });
        continue;
      }

      seenIds.add(entry.id);
    }
  });
