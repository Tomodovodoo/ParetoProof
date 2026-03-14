import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "../components/app-icon";
import { getApiBaseUrl } from "../lib/api-base-url";
import {
  buildAccessStartUrl,
  buildPortalUrl,
  buildPublicUrl,
  isLocalHostname
} from "../lib/surface";

type AuthEntryProps = {
  redirectPath: string;
};

const authChecks = [
  "We match this provider to your existing ParetoProof account whenever possible.",
  "If your account still needs approval, we will say that clearly before portal entry.",
  "If sign-in or recovery needs attention, you stay on a branded surface with next steps."
];

export function AuthEntry({ redirectPath }: AuthEntryProps) {
  const githubStartUrl = buildAccessStartUrl("github", redirectPath);
  const googleStartUrl = buildAccessStartUrl("google", redirectPath);
  const isLocal = isLocalHostname(window.location.hostname.toLowerCase());
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const portalUrl = useMemo(() => buildPortalUrl(redirectPath), [redirectPath]);
  const [isCheckingSession, setIsCheckingSession] = useState(!isLocal);
  const handoffMode = new URLSearchParams(window.location.search).get("handoff");
  const showFailedNotice = handoffMode === "failed";
  const showRetryNotice = handoffMode === "retry";
  const showAuxiliaryStatus = showFailedNotice || showRetryNotice || isCheckingSession;

  useEffect(() => {
    if (isLocal) {
      return;
    }

    const controller = new AbortController();

    async function resolveExistingSession() {
      try {
        const response = await fetch(`${apiBaseUrl}/portal/me`, {
          credentials: "include",
          headers: {
            Accept: "application/json"
          },
          signal: controller.signal
        });

        if (response.ok) {
          window.location.replace(portalUrl);
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
      }

      if (!controller.signal.aborted) {
        setIsCheckingSession(false);
      }
    }

    void resolveExistingSession();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, isLocal, portalUrl]);

  return (
    <main className="auth-shell">
      <section
        className={`auth-card auth-card-polished${
          showAuxiliaryStatus ? " auth-card-handoff-state" : ""
        }`}
      >
        <div className="auth-card-intro">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="shield" />
            </span>
            ParetoProof portal
          </p>
          <h1>Sign in to the contributor portal.</h1>
          <p className="auth-lead">
            Use GitHub or Google to continue. If this browser already has an approved
            ParetoProof session, we will take you straight into the portal.
          </p>
          {showRetryNotice ? (
            <p className="auth-panel-copy">
              That sign-in handoff did not finish cleanly. Start again here and we will
              retry from a fresh branded entry.
            </p>
          ) : null}
          {showFailedNotice ? (
            <p className="auth-panel-copy">
              The provider handoff could not be started cleanly. Start again here and we
              will open a fresh sign-in flow.
            </p>
          ) : null}
          {isCheckingSession ? (
            <p className="auth-panel-copy">
              Checking whether this browser already has a valid portal session.
            </p>
          ) : null}
        </div>

        <div className="auth-provider-layout">
          <section className="auth-provider-panel">
            <p className="section-tag">Sign in</p>
            <h2>Choose a sign-in method</h2>
            <p className="auth-panel-copy">
              Pick the provider that matches the identity you use for ParetoProof.
            </p>
            <div className="auth-provider-list">
              <a className="auth-provider-button" href={githubStartUrl}>
                <span className="auth-provider-mark" aria-hidden="true">
                  <AppIcon name="github" />
                </span>
                <span>
                  <strong>Continue with GitHub</strong>
                  <small>Best for contributors working from GitHub-linked repositories.</small>
                </span>
                <span className="auth-provider-arrow" aria-hidden="true">
                  <AppIcon name="arrow-right" />
                </span>
              </a>
              <a className="auth-provider-button" href={googleStartUrl}>
                <span className="auth-provider-mark" aria-hidden="true">
                  <AppIcon name="google" />
                </span>
                <span>
                  <strong>Continue with Google</strong>
                  <small>Use Google when your approved ParetoProof identity lives outside GitHub.</small>
                </span>
                <span className="auth-provider-arrow" aria-hidden="true">
                  <AppIcon name="arrow-right" />
                </span>
              </a>
            </div>
          </section>

          <aside className="auth-provider-panel auth-provider-panel-notes">
            <p className="section-tag">Before you continue</p>
            <h2>What happens next</h2>
            <ul className="auth-check-list">
              {authChecks.map((item) => (
                <li key={item}>
                  <span className="auth-check-mark" aria-hidden="true">
                    <AppIcon name="check" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <div className="auth-card-footer">
          <p>
            {isLocal
              ? "This development build can open a seeded approved portal session without Cloudflare Access."
              : "Not approved yet? Sign in first, then submit your contributor access request from inside the portal."}
          </p>
          <a className="button button-secondary" href={buildPublicUrl("/")}>
            Back to paretoproof.com
          </a>
        </div>
      </section>
    </main>
  );
}
