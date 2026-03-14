import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "../components/app-icon";
import { getApiBaseUrl } from "../lib/api-base-url";
import {
  buildAccessRequestUrl,
  buildAccessStartUrl,
  buildAuthUrl,
  buildPortalUrl,
  buildPublicUrl,
  isLocalHostname
} from "../lib/surface";

type AuthEntryProps = {
  redirectPath: string;
};

const signInChecks = [
  "We match this provider to your existing ParetoProof account whenever possible.",
  "If your account still needs approval, we will let you know clearly before portal entry.",
  "If sign-in or recovery needs attention, you will see clear next steps."
];

const accessRequestChecks = [
  "New collaborators verify identity before submitting an access request.",
  "After verification, you will be taken to the contributor access request form.",
  "Approval is manual — requesting access is separate from approved sign-in."
];

export function resolveAuthEntryMode(redirectPath: string) {
  return redirectPath === "/access-request" ? "access_request" : "sign_in";
}

export function buildAuthEntrySessionCheckRequestInit(signal: AbortSignal): RequestInit {
  return {
    credentials: "include",
    headers: {
      Accept: "application/json"
    },
    redirect: "manual",
    signal
  };
}

export function resolveAuthEntrySessionCheckAction(response: Pick<Response, "ok" | "status" | "type">) {
  if (response.ok) {
    return "redirect_portal";
  }

  if (response.type === "opaqueredirect" || response.status === 401) {
    return "stay_on_auth_entry";
  }

  return "stay_on_auth_entry";
}

export function AuthEntry({ redirectPath }: AuthEntryProps) {
  const mode = resolveAuthEntryMode(redirectPath);
  const githubStartUrl = buildAccessStartUrl("github", redirectPath);
  const googleStartUrl = buildAccessStartUrl("google", redirectPath);
  const approvedSignInUrl = buildAuthUrl("/");
  const accessRequestUrl = buildAccessRequestUrl();
  const isLocal = isLocalHostname(window.location.hostname.toLowerCase());
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const portalUrl = useMemo(() => buildPortalUrl(redirectPath), [redirectPath]);
  const [isCheckingSession, setIsCheckingSession] = useState(!isLocal);
  const handoffMode = new URLSearchParams(window.location.search).get("handoff");
  const showFailedNotice = handoffMode === "failed";
  const showRetryNotice = handoffMode === "retry";
  const showAuxiliaryStatus = showFailedNotice || showRetryNotice || isCheckingSession;
  const authChecks = mode === "access_request" ? accessRequestChecks : signInChecks;

  useEffect(() => {
    if (isLocal) {
      return;
    }

    const controller = new AbortController();

    async function resolveExistingSession() {
      try {
        const response = await fetch(
          `${apiBaseUrl}/portal/me`,
          buildAuthEntrySessionCheckRequestInit(controller.signal)
        );
        const action = resolveAuthEntrySessionCheckAction(response);

        if (action === "redirect_portal") {
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
          <h1>
            {mode === "access_request"
              ? "Request contributor access."
              : "Sign in to the contributor portal."}
          </h1>
          <p className="auth-lead">
            {mode === "access_request"
              ? "Use GitHub or Google to verify your identity. After that, we will take you to the access request form."
              : "Use GitHub or Google to continue. If you already have an active session, we will take you straight into the portal."}
          </p>
          {showRetryNotice ? (
            <p className="auth-panel-copy">
              Sign-in did not complete. Please try again.
            </p>
          ) : null}
          {showFailedNotice ? (
            <p className="auth-panel-copy">
              Something went wrong during sign-in. Please try again.
            </p>
          ) : null}
          {isCheckingSession ? (
            <p className="auth-panel-copy">
              Checking for an existing session...
            </p>
          ) : null}
        </div>

        <div className="auth-provider-layout">
          <section className="auth-provider-panel">
            <p className="section-tag">
              {mode === "access_request" ? "Verify identity" : "Sign in"}
            </p>
            <h2>
              {mode === "access_request"
                ? "Choose the identity you want reviewed"
                : "Choose a sign-in method"}
            </h2>
            <p className="auth-panel-copy">
              {mode === "access_request"
                ? "Choose the provider you want linked to your access request."
                : "Choose the provider linked to your ParetoProof account."}
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
              ? "Running locally — authentication is bypassed for development."
              : mode === "access_request"
                ? "Already have an account? Use the sign-in entry instead."
                : "New here? Request contributor access to get started."}
          </p>
          <a
            className="button"
            href={mode === "access_request" ? approvedSignInUrl : accessRequestUrl}
          >
            {mode === "access_request"
              ? "Approved contributor sign in"
              : "Request collaborator access"}
          </a>
          <a className="button button-secondary" href={buildPublicUrl("/")}>
            Back to paretoproof.com
          </a>
        </div>
      </section>
    </main>
  );
}
