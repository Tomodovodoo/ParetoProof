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
