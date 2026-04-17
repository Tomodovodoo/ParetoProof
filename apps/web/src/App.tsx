import { useSurfaceNavigation } from "./lib/web-navigation";
import { AccessCompletion } from "./routes/access-completion";
import { AuthEntry } from "./routes/auth-entry";
import { PortalBootstrap } from "./routes/portal-bootstrap";
import { PublicSite } from "./routes/public-site";
import {
  readAuthenticatedRedirectSurface,
  readAuthenticatedRedirectTarget,
  resolveAccessProviderHost,
  resolveWebSurface
} from "./lib/surface";

export default function App() {
  const surface = resolveWebSurface();
  useSurfaceNavigation(surface);
  const redirectPath = readAuthenticatedRedirectTarget();
  const redirectSurface = readAuthenticatedRedirectSurface();
  const authProvider = resolveAccessProviderHost();

  if (surface === "auth") {
    if (authProvider) {
      return (
        <AccessCompletion
          provider={authProvider}
          redirectPath={redirectPath}
          redirectSurface={redirectSurface}
        />
      );
    }

    return <AuthEntry redirectPath={redirectPath} redirectSurface={redirectSurface} />;
  }

  if (surface === "portal") {
    return <PortalBootstrap />;
  }

  if (surface === "math") {
    return <PortalBootstrap surface="math" />;
  }

  return <PublicSite />;
}
