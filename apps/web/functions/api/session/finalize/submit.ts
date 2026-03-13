import { handleSessionFinalize } from "../../../_shared/session-finalize";

type SessionFinalizeContext = {
  env: {
    API_BASE_URL?: string;
  };
  request: Request;
};

export const onRequest = ({ env, request }: SessionFinalizeContext) =>
  handleSessionFinalize(request, env);
