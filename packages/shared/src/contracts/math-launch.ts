import {
  mathHostedLaunchBootstrapResponseSchema,
  mathHostedLaunchRequestSchema,
  mathLocalConnectedBootstrapResponseSchema,
  mathLocalConnectedLaunchRequestSchema,
  mathOfflineExportBootstrapResponseSchema,
  mathOfflineExportRequestSchema,
  mathQuestionLaunchBootstrapResponseSchema,
  mathQuestionLaunchRequestSchema
} from "../schemas/math-launch.js";

export const mathQuestionLaunchContract = {
  bootstrapResponse: mathQuestionLaunchBootstrapResponseSchema,
  hostedBootstrapResponse: mathHostedLaunchBootstrapResponseSchema,
  hostedRequest: mathHostedLaunchRequestSchema,
  localConnectedBootstrapResponse: mathLocalConnectedBootstrapResponseSchema,
  localConnectedRequest: mathLocalConnectedLaunchRequestSchema,
  offlineExportBootstrapResponse: mathOfflineExportBootstrapResponseSchema,
  offlineExportRequest: mathOfflineExportRequestSchema,
  request: mathQuestionLaunchRequestSchema
};

export const mathQuestionLaunchCredentialRules = [
  {
    browserAcceptsRawProviderSecret: false,
    credentialPolicy: "platform_managed",
    mode: "hosted"
  },
  {
    browserAcceptsRawProviderSecret: false,
    credentialPolicy: "runner_host_local",
    mode: "local_connected"
  },
  {
    browserAcceptsRawProviderSecret: false,
    credentialPolicy: "none",
    mode: "offline_export"
  }
] as const;
