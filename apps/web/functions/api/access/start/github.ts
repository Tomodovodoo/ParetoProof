import { handleAccessStart } from "../../../_shared/access-start";

export const onRequestGet = ({ request }: { request: Request }) =>
  handleAccessStart(request, "github");
