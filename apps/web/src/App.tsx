import { AuthEntry } from "./routes/auth-entry";
import { PortalBootstrap } from "./routes/portal-bootstrap";
import { PublicSite } from "./routes/public-site";
import { readPortalRedirectTarget, resolveWebSurface } from "./lib/surface";

export default function App() {
  const surface = resolveWebSurface();
  const redirectPath = readPortalRedirectTarget();

  if (surface === "auth") {
    return <AuthEntry redirectPath={redirectPath} />;
  }

  if (surface === "portal") {
    return <PortalBootstrap />;
  }

  return <PublicSite />;
}
