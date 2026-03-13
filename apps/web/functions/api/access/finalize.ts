import { handleAccessFinalize } from "../../_shared/access-finalize";

export const onRequestPost = ({ request }: { request: Request }) =>
  handleAccessFinalize(request);
