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
  "Provider identity should resolve into one ParetoProof account, not duplicate users.",
  "Approval state needs to be surfaced before the portal handoff looks broken.",
  "Recovery should explain what changed instead of dumping users into Access noise."
];

export function AuthEntry({ redirectPath }: AuthEntryProps) {
  const githubStartUrl = buildAccessStartUrl("github", redirectPath);
  const googleStartUrl = buildAccessStartUrl("google", redirectPath);
  const isLocal = isLocalHostname(window.location.hostname.toLowerCase());
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const portalUrl = useMemo(() => buildPortalUrl(redirectPath), [redirectPath]);
  const [isCheckingSession, setIsCheckingSession] = useState(!isLocal);
  const handoffMode = new URLSearchParams(window.location.search).get("handoff");
  const showRetryNotice = handoffMode === "retry";

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
      <section className="auth-card auth-card-polished">
        <div className="auth-card-intro">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="shield" />
            </span>
            ParetoProof portal
          </p>
          <h1>Use one clean entry, then route users into the right identity state.</h1>
          <p className="auth-lead">
            Provider choice, account linking, and contributor approval belong in one
            deliberate handoff instead of a stack of awkward intermediary screens.
          </p>
          {showRetryNotice ? (
            <p className="auth-panel-copy">
              The secure API handoff URL only works after sign-in. Restart from this auth
              entry and already-authenticated browsers will be sent straight to the portal.
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
            <h2>Choose a trusted provider</h2>
            <p className="auth-panel-copy">
              GitHub and Google stay first-class without changing the overall shell.
            </p>
            <div className="auth-provider-list">
              <a className="auth-provider-button" href={githubStartUrl}>
                <span className="auth-provider-mark" aria-hidden="true">
                  <AppIcon name="github" />
                </span>
                <span>
                  <strong>Continue with GitHub</strong>
                  <small>Primary contributor sign-in for repository-linked work.</small>
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
                  <small>Fallback for approved contributors who operate outside GitHub.</small>
                </span>
                <span className="auth-provider-arrow" aria-hidden="true">
                  <AppIcon name="arrow-right" />
                </span>
              </a>
            </div>
          </section>

          <aside className="auth-provider-panel auth-provider-panel-notes">
            <p className="section-tag">Guardrails</p>
            <h2>What the flow has to explain</h2>
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
              : "If you are not approved yet, sign in first and submit your contributor request from inside the portal."}
          </p>
          <a className="button button-secondary" href={buildPublicUrl("/")}>
            Back to paretoproof.com
          </a>
        </div>
      </section>
    </main>
  );
}
