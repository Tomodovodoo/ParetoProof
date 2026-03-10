import { AccessCompletion } from "./routes/access-completion";
import { AuthEntry } from "./routes/auth-entry";
import { PortalBootstrap } from "./routes/portal-bootstrap";
import { PublicSite } from "./routes/public-site";
import {
  readPortalRedirectTarget,
  resolveAccessProviderHost,
  resolveWebSurface
} from "./lib/surface";

export default function App() {
  const surface = resolveWebSurface();
  const redirectPath = readPortalRedirectTarget();
  const authProvider = resolveAccessProviderHost();

  if (surface === "auth") {
    if (authProvider) {
      return <AccessCompletion provider={authProvider} redirectPath={redirectPath} />;
    }

    return <AuthEntry redirectPath={redirectPath} />;
  }

  if (surface === "portal") {
    return <PortalBootstrap />;
  }

  return <PublicSite />;
}
