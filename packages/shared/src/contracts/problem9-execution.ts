export const problem9ProviderFamilies = ["openai"] as const;

export type Problem9ProviderFamily = (typeof problem9ProviderFamilies)[number];

export const problem9LocalAuthModes = [
  "trusted_local_user",
  "machine_api_key",
  "local_stub"
] as const;

export type Problem9LocalAuthMode = (typeof problem9LocalAuthModes)[number];

export const problem9HostedAuthModes = ["machine_api_key"] as const;

export type Problem9HostedAuthMode = (typeof problem9HostedAuthModes)[number];

export const problem9HostedProviderFamilies = ["openai"] as const;

export type Problem9HostedProviderFamily = (typeof problem9HostedProviderFamilies)[number];

export const problem9RunModes = [
  "single_pass_probe",
  "pass_k_probe",
  "bounded_agentic_attempt"
] as const;

export type Problem9RunMode = (typeof problem9RunModes)[number];

export const problem9ToolProfiles = [
  "no_tools",
  "lean_mcp_readonly",
  "workspace_edit_limited"
] as const;

export type Problem9ToolProfile = (typeof problem9ToolProfiles)[number];

export const problem9ModelConfigIdPrefixesByAuthMode = {
  local_stub: "local_stub/",
  machine_api_key: "openai/",
  trusted_local_user: "openai/"
} as const satisfies Record<Problem9LocalAuthMode, string>;

export function getProblem9ModelConfigIdPrefix(authMode: Problem9LocalAuthMode): string {
  return problem9ModelConfigIdPrefixesByAuthMode[authMode];
}

export type Problem9HostedCapabilityViolationCode =
  | "unsupported_hosted_auth_mode"
  | "unsupported_hosted_provider_family"
  | "invalid_hosted_model_config";

export type Problem9HostedCapabilityViolation = {
  code: Problem9HostedCapabilityViolationCode;
  message: string;
};

export function getProblem9HostedCapabilityViolation(options: {
  authMode: string;
  modelConfigId?: string | null;
  providerFamily: string;
}): Problem9HostedCapabilityViolation | null {
  if (!problem9HostedAuthModes.includes(options.authMode as Problem9HostedAuthMode)) {
    return {
      code: "unsupported_hosted_auth_mode",
      message: `Unsupported hosted auth mode ${options.authMode}. Hosted workers support only ${problem9HostedAuthModes.join(", ")}.`
    };
  }

  if (
    !problem9HostedProviderFamilies.includes(
      options.providerFamily as Problem9HostedProviderFamily
    )
  ) {
    return {
      code: "unsupported_hosted_provider_family",
      message: `Unsupported hosted provider family ${options.providerFamily}. Hosted workers support only ${problem9HostedProviderFamilies.join(", ")}.`
    };
  }

  if (options.modelConfigId) {
    const expectedPrefix = getProblem9ModelConfigIdPrefix(
      options.authMode as Problem9HostedAuthMode
    );

    if (!options.modelConfigId.startsWith(expectedPrefix)) {
      return {
        code: "invalid_hosted_model_config",
        message: `Hosted modelConfigId must start with ${expectedPrefix} for auth mode ${options.authMode}; received ${options.modelConfigId}.`
      };
    }
  }

  return null;
}

export function assertProblem9HostedCapability(options: {
  authMode: string;
  modelConfigId?: string | null;
  providerFamily: string;
}): void {
  const violation = getProblem9HostedCapabilityViolation(options);

  if (violation) {
    throw new Error(violation.message);
  }
}
