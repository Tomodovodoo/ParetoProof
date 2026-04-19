import {
  mathHostedLaunchCreateInputSchema,
  mathHostedLaunchCreateResponseSchema,
  mathLocalConnectedLaunchCreateInputSchema,
  mathLocalConnectedLaunchCreateResponseSchema,
  mathOfflineExportCreateInputSchema,
  mathOfflineExportCreateResponseSchema,
  mathQuestionLaunchViewResponseSchema,
  mathQuestionParamsSchema,
  mathRunnerBootstrapSessionParamsSchema,
  mathRunnerBootstrapSessionRedeemInputSchema,
  mathRunnerBootstrapSessionRedeemResponseSchema
} from "../schemas/math-launch.js";

export const mathLaunchContract = {
  hostedLaunchCreateInput: mathHostedLaunchCreateInputSchema,
  hostedLaunchCreateResponse: mathHostedLaunchCreateResponseSchema,
  localConnectedLaunchCreateInput: mathLocalConnectedLaunchCreateInputSchema,
  localConnectedLaunchCreateResponse: mathLocalConnectedLaunchCreateResponseSchema,
  offlineExportCreateInput: mathOfflineExportCreateInputSchema,
  offlineExportCreateResponse: mathOfflineExportCreateResponseSchema,
  questionLaunchParams: mathQuestionParamsSchema,
  questionLaunchViewResponse: mathQuestionLaunchViewResponseSchema,
  runnerBootstrapSessionParams: mathRunnerBootstrapSessionParamsSchema,
  runnerBootstrapSessionRedeemInput: mathRunnerBootstrapSessionRedeemInputSchema,
  runnerBootstrapSessionRedeemResponse: mathRunnerBootstrapSessionRedeemResponseSchema
};
