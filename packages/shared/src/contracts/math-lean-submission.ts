import {
  leanArtifactLifecycleStageByArtifactRole,
  leanArtifactOwnerScopeByArtifactRole,
  mathLeanAutomationEnqueueInputSchema,
  mathLeanReviewGateUpdateInputSchema,
  mathLeanSubmissionPatchInputSchema,
  mathLeanSubmissionCreateInputSchema,
  mathLeanSubmissionDetailSchema,
  mathLeanSubmissionProfileBaseSchema,
  mathLeanSubmissionProfileSchema
} from "../schemas/math-lean-submission.js";
import type {
  LeanArtifactRole,
  LeanArtifactRoleCatalogEntry,
  LeanAutomationCheckCatalogEntry,
  LeanAutomationCheckKind,
  LeanReviewGateCatalogEntry,
  LeanReviewGateKind,
  LeanSubmissionKind,
  LeanSubmissionKindCatalogEntry,
  MathLeanSubmissionPatchInput,
  MathLeanSubmissionProfile,
  MathLeanSubmissionStoredProfile,
} from "../types/math-lean-submission.js";

const leanArtifactRoleSummaryById = {
  statement_source:
    "Canonical statement material owned by the question revision rather than the submission.",
  supporting_lean_module:
    "Optional Lean source supplied alongside the submission entrypoint to satisfy imports or local helper definitions.",
  submission_entrypoint:
    "Primary Lean module or declaration submitted for compile, verifier, and equivalence checks.",
  compile_output:
    "Generated stdout or build output emitted by the authoritative Lean compile step.",
  compile_diagnostics:
    "Structured diagnostics generated from the compile step for reviewer and submitter follow-up.",
  verifier_output:
    "Structured verifier and proof-policy output generated after successful compilation.",
  equivalence_report:
    "Generated equivalence-check output comparing a submission against the relevant canonical target.",
  review_attachment:
    "Supplementary reviewer-facing attachment that is not itself part of the Lean automation input."
} as const satisfies Record<LeanArtifactRole, string>;

export const leanArtifactRoleCatalog = (
  Object.entries(leanArtifactRoleSummaryById) as [LeanArtifactRole, string][]
).map(([id, summary]) => ({
  id,
  lifecycleStage: leanArtifactLifecycleStageByArtifactRole[id],
  ownerScope: leanArtifactOwnerScopeByArtifactRole[id],
  summary
})) satisfies LeanArtifactRoleCatalogEntry[];

export const leanAutomationCheckCatalog = [
  {
    generatedArtifactRoles: ["compile_output", "compile_diagnostics"],
    id: "compile",
    summary:
      "Authoritative Lean compilation for the submission entrypoint and its supplied support files."
  },
  {
    generatedArtifactRoles: ["verifier_output"],
    id: "verifier",
    summary:
      "Structured proof-policy and verifier evaluation run after compilation succeeds."
  },
  {
    generatedArtifactRoles: ["equivalence_report"],
    id: "equivalence",
    summary:
      "Comparison of the submission against the declared canonical target when equivalence is relevant."
  }
] satisfies LeanAutomationCheckCatalogEntry[];

export const leanReviewGateCatalog = [
  {
    id: "peer_review",
    summary:
      "Substantive mathematical review by an appropriately independent reviewer."
  },
  {
    id: "editor_review",
    summary:
      "Editorial review of structure, clarity, and readiness for downstream workflow."
  },
  {
    id: "provenance_review",
    summary:
      "Review of problem origin, legitimacy, and source-tracking requirements."
  },
  {
    id: "policy_review",
    summary:
      "Review of benchmark-policy and release-boundary requirements that automation alone cannot satisfy."
  }
] satisfies LeanReviewGateCatalogEntry[];

export const leanSubmissionKindCatalog = [
  {
    defaultApplicableCheckKinds: ["compile", "verifier", "equivalence"],
    defaultRequiredReviewGates: ["peer_review", "editor_review", "policy_review"],
    id: "lean_proof_submission",
    optionalInputArtifactRoles: ["supporting_lean_module", "review_attachment"],
    requiredInputArtifactRoles: ["submission_entrypoint"],
    summary:
      "Lean proof submission targeting a known statement where compilation, proof-policy checks, and equivalence are normally relevant."
  },
  {
    defaultApplicableCheckKinds: ["compile", "verifier"],
    defaultRequiredReviewGates: [
      "peer_review",
      "editor_review",
      "provenance_review",
      "policy_review"
    ],
    id: "lean_formalization_submission",
    optionalInputArtifactRoles: ["supporting_lean_module", "review_attachment"],
    requiredInputArtifactRoles: ["submission_entrypoint"],
    summary:
      "Lean formalization submission where compilation and verifier policy still matter, but equivalence may not apply by default."
  },
  {
    defaultApplicableCheckKinds: ["compile", "verifier", "equivalence"],
    defaultRequiredReviewGates: ["editor_review", "policy_review"],
    id: "lean_repair_submission",
    optionalInputArtifactRoles: ["supporting_lean_module", "review_attachment"],
    requiredInputArtifactRoles: ["submission_entrypoint"],
    summary:
      "Lean repair submission revising prior work against a known target, usually with stricter automation follow-up before broader review."
  }
] satisfies LeanSubmissionKindCatalogEntry[];

const leanSubmissionKindCatalogById = new Map(
  leanSubmissionKindCatalog.map((entry) => [entry.id, entry])
);

const leanAutomationCheckCatalogById = new Map(
  leanAutomationCheckCatalog.map((entry) => [entry.id, entry])
);

export const defaultLeanReviewGateMatrixBySubmissionKind = Object.fromEntries(
  leanSubmissionKindCatalog.map((entry) => [entry.id, entry.defaultRequiredReviewGates])
) as Record<LeanSubmissionKind, LeanReviewGateKind[]>;

export function getLeanSubmissionKindDefinition(kind: LeanSubmissionKind) {
  return leanSubmissionKindCatalogById.get(kind) ?? null;
}

export function getDefaultLeanAutomationChecks(
  profile: Pick<
    MathLeanSubmissionStoredProfile,
    "equivalenceExpectation" | "leanSubmissionKind"
  >
): LeanAutomationCheckKind[] {
  const defaultChecks = [
    ...(getLeanSubmissionKindDefinition(profile.leanSubmissionKind)?.defaultApplicableCheckKinds ??
      [])
  ];

  if (profile.equivalenceExpectation === "not_applicable") {
    return defaultChecks.filter((checkKind) => checkKind !== "equivalence");
  }

  return defaultChecks;
}

export function getDefaultLeanReviewGates(kind: LeanSubmissionKind): LeanReviewGateKind[] {
  return [...(getLeanSubmissionKindDefinition(kind)?.defaultRequiredReviewGates ?? [])];
}

export function getRequiredLeanInputArtifactRoles(kind: LeanSubmissionKind): LeanArtifactRole[] {
  return [...(getLeanSubmissionKindDefinition(kind)?.requiredInputArtifactRoles ?? [])];
}

export function getOptionalLeanInputArtifactRoles(kind: LeanSubmissionKind): LeanArtifactRole[] {
  return [...(getLeanSubmissionKindDefinition(kind)?.optionalInputArtifactRoles ?? [])];
}

export function getAllowedLeanInputArtifactRoles(kind: LeanSubmissionKind): LeanArtifactRole[] {
  const definition = getLeanSubmissionKindDefinition(kind);

  if (!definition) {
    return [];
  }

  return [
    ...new Set([
      ...definition.requiredInputArtifactRoles,
      ...definition.optionalInputArtifactRoles
    ])
  ];
}

export function getGeneratedLeanArtifactRolesForCheckKind(
  checkKind: LeanAutomationCheckKind
): LeanArtifactRole[] {
  return [...(leanAutomationCheckCatalogById.get(checkKind)?.generatedArtifactRoles ?? [])];
}

export function isLeanArtifactRoleAllowedForSubmissionKind(
  kind: LeanSubmissionKind,
  artifactRole: LeanArtifactRole
) {
  return getAllowedLeanInputArtifactRoles(kind).includes(artifactRole);
}

export function applyMathLeanStoredSubmissionProfileUpdate(
  profile: MathLeanSubmissionStoredProfile,
  update: MathLeanSubmissionPatchInput
): MathLeanSubmissionProfile {
  const parsedProfile = mathLeanSubmissionProfileBaseSchema.parse(profile);
  const parsedUpdate = mathLeanSubmissionPatchInputSchema.parse(update);
  const hasExplicitEquivalenceExpectation = "equivalenceExpectation" in parsedUpdate;
  const setsTargetReference =
    parsedUpdate.targetDeclarationName !== undefined &&
      parsedUpdate.targetDeclarationName !== null ||
    parsedUpdate.targetLaneId !== undefined &&
      parsedUpdate.targetLaneId !== null ||
    parsedUpdate.targetModuleName !== undefined &&
      parsedUpdate.targetModuleName !== null;
  const nextEquivalenceExpectation =
    (hasExplicitEquivalenceExpectation ? parsedUpdate.equivalenceExpectation : undefined) ??
    parsedProfile.equivalenceExpectation;
  const clearsTarget = nextEquivalenceExpectation === "not_applicable";

  if (clearsTarget && !hasExplicitEquivalenceExpectation && setsTargetReference) {
    throw new Error(
      "Target field updates require equivalenceExpectation to reference an existing target."
    );
  }

  // Stored profiles can be legacy-invalid, so validate the merged normalized result too.
  return mathLeanSubmissionProfileSchema.parse({
    equivalenceExpectation: nextEquivalenceExpectation,
    leanSubmissionKind: parsedProfile.leanSubmissionKind,
    targetDeclarationName: clearsTarget
      ? null
      : parsedUpdate.targetDeclarationName !== undefined
        ? parsedUpdate.targetDeclarationName
        : parsedProfile.targetDeclarationName,
    targetLaneId: clearsTarget
      ? null
      : parsedUpdate.targetLaneId !== undefined
        ? parsedUpdate.targetLaneId
        : parsedProfile.targetLaneId,
    targetModuleName: clearsTarget
      ? null
      : parsedUpdate.targetModuleName !== undefined
        ? parsedUpdate.targetModuleName
        : parsedProfile.targetModuleName
  });
}

export const mathLeanSubmissionContract = {
  automationEnqueueInput: mathLeanAutomationEnqueueInputSchema,
  reviewGateUpdateInput: mathLeanReviewGateUpdateInputSchema,
  submissionPatchInput: mathLeanSubmissionPatchInputSchema,
  submissionCreateInput: mathLeanSubmissionCreateInputSchema,
  submissionDetail: mathLeanSubmissionDetailSchema
};
