import { handleAccessSession } from "../../_shared/access-session";

export const onRequestGet = ({ request }: { request: Request }) =>
  handleAccessSession(request);
