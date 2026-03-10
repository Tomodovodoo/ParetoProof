import { handleAccessStart } from "../../../_shared/access-start";

export const onRequestGet = ({ env, request }: { env: { ACCESS_PROVIDER_STATE_SECRET?: string }; request: Request }) =>
  handleAccessStart(request, env, "google");
