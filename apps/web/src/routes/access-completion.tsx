import { useEffect } from "react";
import { AppIcon } from "../components/app-icon";
import {
  buildApiSessionFinalizeUrl,
  buildAuthUrl,
  buildPortalUrl
} from "../lib/surface";

type AccessCompletionProps = {
  provider: "github" | "google";
  redirectPath: string;
};

export function AccessCompletion({ provider, redirectPath }: AccessCompletionProps) {
  useEffect(() => {
    const iframeName = `portal-session-finalize-${provider}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const retryUrl = new URL(buildAuthUrl(redirectPath));
    const portalUrl = buildPortalUrl(redirectPath);
    const portalSessionUrl = new URL("/portal/me", "https://api.paretoproof.com").toString();
    let isDisposed = false;
    let isCheckingSession = false;

    iframe.name = iframeName;
    iframe.style.display = "none";

    form.target = iframeName;
    form.method = "POST";
    form.action = buildApiSessionFinalizeUrl(redirectPath);
    form.style.display = "none";

    retryUrl.searchParams.set("handoff", "retry");

    const disposeAndRedirect = (targetUrl: string) => {
      if (isDisposed) {
        return;
      }

      isDisposed = true;
      window.clearInterval(sessionPollIntervalId);
      window.clearTimeout(sessionDeadlineTimeoutId);
      window.location.replace(targetUrl);
    };

    const checkPortalSession = async () => {
      if (isDisposed || isCheckingSession) {
        return;
      }

      isCheckingSession = true;

      try {
        const response = await fetch(portalSessionUrl, {
          credentials: "include"
        });

        if (!response.ok) {
          return;
        }

        disposeAndRedirect(portalUrl);
      } catch {
        return;
      } finally {
        isCheckingSession = false;
      }
    };

    const sessionPollIntervalId = window.setInterval(() => {
      void checkPortalSession();
    }, 1000);
    const sessionDeadlineTimeoutId = window.setTimeout(() => {
      disposeAndRedirect(retryUrl.toString());
    }, 12000);

    document.body.append(iframe);
    document.body.append(form);
    form.submit();
    void checkPortalSession();

    return () => {
      isDisposed = true;
      window.clearInterval(sessionPollIntervalId);
      window.clearTimeout(sessionDeadlineTimeoutId);
      iframe.remove();
      form.remove();
    };
  }, [provider, redirectPath]);

  const providerLabel = provider === "github" ? "GitHub" : "Google";

  return (
    <main className="auth-shell auth-shell-compact">
      <section className="auth-inline-status">
        <p className="eyebrow">
          <span className="inline-icon" aria-hidden="true">
            <AppIcon name="shield" />
          </span>
          ParetoProof Portal
        </p>
        <h1>Completing {providerLabel} sign in</h1>
        <p>
          Your Cloudflare Access session is active. Finishing the portal handoff now.
        </p>
      </section>
    </main>
  );
}
