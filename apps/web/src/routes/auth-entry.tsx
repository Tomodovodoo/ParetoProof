import { useEffect } from "react";
import { buildPortalUrl } from "../lib/surface";

type AuthEntryProps = {
  redirectPath: string;
};

export function AuthEntry({ redirectPath }: AuthEntryProps) {
  const portalUrl = buildPortalUrl(redirectPath);

  useEffect(() => {
    const redirectTimer = window.setTimeout(() => {
      window.location.replace(portalUrl);
    }, 250);

    return () => {
      window.clearTimeout(redirectTimer);
    };
  }, [portalUrl]);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Authentication</p>
        <h1>Redirecting to the protected portal.</h1>
        <p>
          The portal itself stays behind Cloudflare Access. If the automatic
          redirect does not start, continue manually.
        </p>
        <a className="button" href={portalUrl}>
          Continue to portal
        </a>
      </section>
    </main>
  );
}
