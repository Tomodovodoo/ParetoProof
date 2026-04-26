import {
  portalMeResponseSchema,
  type PortalMeResponse
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "../components/app-icon";
import { getApiBaseUrl } from "../lib/api-base-url";
import {
  type ApprovedAuthHandoff,
  writeApprovedAuthHandoffCookie
} from "../lib/approved-auth-handoff";
import { fetchApi } from "../lib/api-fetch";
import {
  buildAccessRequestUrl,
  buildAccessStartUrl,
  buildAuthenticatedAppUrl,
  buildAuthUrl,
  buildPortalUrl,
  buildPublicUrl,
  describeAuthenticatedSurface,
  type AuthenticatedSurface,
  isLocalHostname
} from "../lib/surface";

type AuthEntryProps = {
  redirectPath: string;
  redirectSurface: AuthenticatedSurface;
};

type AuthEntrySessionCheckPayload = PortalMeResponse;

type AuthEntryAction = {
  copy: string;
  href: string;
  icon: AppIconName;
  title: string;
};

type AuthEntryLocalExperience = {
  actions: AuthEntryAction[];
  checks: string[];
  footerCta?: {
    href: string;
    label: string;
  };
  footerText: string;
  lead: string;
  panelCopy: string;
  panelTag: string;
  panelTitle: string;
};

const signInChecks = [
  "We match this provider to your existing ParetoProof account whenever possible.",
  "If your account still needs approval, we will let you know clearly before portal entry.",
  "If sign-in or recovery needs attention, you will see clear next steps."
];

const accessRequestChecks = [
  "New collaborators verify identity before submitting an access request.",
  "After verification, you will be taken to the contributor access request form.",
  "Approval is manual - requesting access is separate from approved sign-in."
];

const localSignInChecks = [
  "Local development bypasses live provider sign-in and uses this auth surface only for preview routing.",
  "Open the destination preview when your local or configured API target is reachable.",
  "Switch to the access-request entry preview to verify that path without a live identity handoff."
];

const localAccessRequestChecks = [
  "Local development does not verify GitHub or Google identities before showing this entry.",
  "Use the access-request route preview when your API target is reachable and you need to inspect request-state UX.",
  "If the API is offline, the destination surface will tell you exactly which backend target is missing."
];

export function resolveAuthEntryMode(redirectPath: string) {
  return redirectPath === "/access-request" ? "access_request" : "sign_in";
}

export function resolveAuthEntryApprovedPortalTargetPath(redirectPath: string) {
  return redirectPath === "/access-request" ? "/" : redirectPath;
}

export function buildLocalAuthEntryPreviewState(
  mode: ReturnType<typeof resolveAuthEntryMode>,
  redirectPath: string,
  redirectSurface: AuthenticatedSurface
): AuthEntryLocalExperience {
  if (mode === "access_request") {
    return {
      actions: [
        {
          copy:
            "Continue into the access-request route preview once your local or configured API is reachable.",
          href: buildPortalUrl("/access-request"),
          icon: "key",
          title: "Open local access-request route"
        },
        {
          copy:
            "Return to the standard local auth guidance without triggering any provider handoff.",
          href: buildAuthUrl("/", undefined, {
            surface: redirectSurface
          }),
          icon: "shield",
          title: "Open local sign-in guidance"
        }
      ],
      checks: localAccessRequestChecks,
      footerText:
        "Running locally - this entry explains the request path, but the actual portal route still needs a reachable API target.",
      lead:
        "Local development bypasses provider verification here. Use this entry to inspect request guidance, then open the access-request route preview against your API target.",
      panelCopy:
        "Choose which local preview path you want to inspect next.",
      panelTag: "Local preview",
      panelTitle: "Choose the next local access step"
    };
  }

  return {
    actions: [
      {
        copy:
          redirectSurface === "math"
            ? "Open the math workspace preview directly against your local or configured API target."
            : "Open the contributor portal shell directly against your local or configured API target.",
        href: buildAuthenticatedAppUrl(
          resolveAuthEntryApprovedPortalTargetPath(redirectPath),
          {
            surface: redirectSurface
          }
        ),
        icon: "grid",
        title:
          redirectSurface === "math"
            ? "Open local math preview"
            : "Open local portal preview"
      },
      {
        copy:
          "Switch to the access-request entry preview without triggering a live provider handoff.",
        href: buildAuthUrl("/access-request", undefined, {
          surface: "portal"
        }),
        icon: "key",
        title: "Open local access-request preview"
      }
    ],
    checks: localSignInChecks,
    footerText:
      "Running locally - live provider sign-in is disabled here, so use the preview routes above or return to the public site.",
    lead:
      "Local development bypasses live provider sign-in. Use this entry to move into the destination preview once your API target is reachable.",
    panelCopy:
      "Choose the local preview route you want to inspect next.",
    panelTag: "Local preview",
    panelTitle: "Choose a local preview"
  };
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

export function parseAuthEntrySessionCheckPayload(
  payload: unknown
): AuthEntrySessionCheckPayload | null {
  const parsed = portalMeResponseSchema.safeParse(payload);

  return parsed.success ? parsed.data : null;
}

export function shouldStayOnAuthEntryForProviderlessRecovery(
  payload: AuthEntrySessionCheckPayload | null
) {
  return (
    payload?.access.status === "denied" &&
    payload.access.reason === "identity_recovery_required" &&
    payload.identity?.provider === null
  );
}

export function shouldSkipAuthEntrySessionCheck(search = window.location.search) {
  return new URLSearchParams(search).get("guidance") === "1";
}

export type AuthEntrySessionCheckAction =
  | "redirect_access_request"
  | "redirect_authenticated_app"
  | "redirect_denied"
  | "redirect_pending"
  | "stay_on_auth_entry";

export function resolveAuthEntrySessionCheckAction(
  response: Pick<Response, "ok" | "status" | "type">,
  payload: AuthEntrySessionCheckPayload | null = null
): AuthEntrySessionCheckAction {
  if (response.ok) {
    if (!payload) {
      return "stay_on_auth_entry";
    }

    if (shouldStayOnAuthEntryForProviderlessRecovery(payload)) {
      return "stay_on_auth_entry";
    }

    if (payload?.access.status === "pending") {
      return "redirect_pending";
    }

    if (payload?.access.status === "denied") {
      if (payload.access.reason === "access_request_required") {
        return "redirect_access_request";
      }

      return "redirect_denied";
    }

    if (payload.access.status === "approved") {
      return "redirect_authenticated_app";
    }

    return "stay_on_auth_entry";
  }

  if (response.type === "opaqueredirect" || response.status === 401) {
    return "stay_on_auth_entry";
  }

  return "stay_on_auth_entry";
}

export function resolveApprovedAuthEntryHandoff(
  action: AuthEntrySessionCheckAction,
  payload: AuthEntrySessionCheckPayload | null,
  redirectSurface: AuthenticatedSurface
): ApprovedAuthHandoff | null {
  if (action !== "redirect_authenticated_app" || payload?.access.status !== "approved") {
    return null;
  }

  return {
    role: payload.access.role ?? null,
    status: "approved",
    surface: redirectSurface
  };
}

export function AuthEntry({ redirectPath, redirectSurface }: AuthEntryProps) {
  const mode = resolveAuthEntryMode(redirectPath);
  const githubStartUrl = buildAccessStartUrl("github", redirectPath, {
    surface: redirectSurface
  });
  const googleStartUrl = buildAccessStartUrl("google", redirectPath, {
    surface: redirectSurface
  });
  const approvedSignInUrl = buildAuthUrl("/", undefined, {
    surface: "portal"
  });
  const accessRequestUrl = buildAccessRequestUrl();
  const isLocal = isLocalHostname(window.location.hostname.toLowerCase());
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const destinationUrl = useMemo(
    () =>
      buildAuthenticatedAppUrl(
        resolveAuthEntryApprovedPortalTargetPath(redirectPath),
        {
          surface: redirectSurface
        }
      ),
    [redirectPath, redirectSurface]
  );
  const destinationLabel = describeAuthenticatedSurface(redirectSurface);
  const portalAccessRequestUrl = useMemo(() => buildPortalUrl("/access-request"), []);
  const portalDeniedUrl = useMemo(() => buildPortalUrl("/denied"), []);
  const portalPendingUrl = useMemo(() => buildPortalUrl("/pending"), []);
  const localExperience = useMemo(
    () => (isLocal ? buildLocalAuthEntryPreviewState(mode, redirectPath, redirectSurface) : null),
    [isLocal, mode, redirectPath, redirectSurface]
  );
  const publicHomeLabel = isLocal ? "Back to local home" : "Back to paretoproof.com";
  const skipSessionCheck = shouldSkipAuthEntrySessionCheck();
  const [isCheckingSession, setIsCheckingSession] = useState(!isLocal && !skipSessionCheck);
  const handoffMode = new URLSearchParams(window.location.search).get("handoff");
  const showFailedNotice = handoffMode === "failed";
  const showRetryNotice = handoffMode === "retry";
  const showAuxiliaryStatus = showFailedNotice || showRetryNotice || isCheckingSession;
  const authChecks = localExperience
    ? localExperience.checks
    : mode === "access_request"
      ? accessRequestChecks
      : signInChecks;

  useEffect(() => {
    if (isLocal || skipSessionCheck) {
      return;
    }

    const controller = new AbortController();

    async function resolveExistingSession() {
      try {
        const response = await fetchApi(
          `${apiBaseUrl}/portal/me`,
          buildAuthEntrySessionCheckRequestInit(controller.signal)
        );
        const payload = response.ok
          ? parseAuthEntrySessionCheckPayload(await response.json())
          : null;
        const action = resolveAuthEntrySessionCheckAction(response, payload);

        if (action !== "stay_on_auth_entry") {
          const approvedHandoff = resolveApprovedAuthEntryHandoff(
            action,
            payload,
            redirectSurface
          );
          const redirectTarget =
            action === "redirect_access_request"
              ? portalAccessRequestUrl
              : action === "redirect_denied"
                ? portalDeniedUrl
                : action === "redirect_pending"
                  ? portalPendingUrl
                  : destinationUrl;

          if (approvedHandoff) {
            writeApprovedAuthHandoffCookie(approvedHandoff);
          }

          window.location.replace(redirectTarget);
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
  }, [
    apiBaseUrl,
    destinationUrl,
    isLocal,
    portalAccessRequestUrl,
    portalDeniedUrl,
    portalPendingUrl,
    redirectSurface,
    skipSessionCheck
  ]);

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
            ParetoProof workspace
          </p>
          <h1>
            {mode === "access_request"
              ? "Request contributor access."
              : "Sign in to your ParetoProof workspace."}
          </h1>
          <p className="auth-lead">
            {localExperience
              ? localExperience.lead
              : mode === "access_request"
                ? "Use GitHub or Google to verify your identity. After that, we will take you to the access request form."
                : `Use GitHub or Google to continue. If you already have an active session, we will take you straight into the ${destinationLabel}.`}
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
              {localExperience
                ? localExperience.panelTag
                : mode === "access_request"
                  ? "Verify identity"
                  : "Sign in"}
            </p>
            <h2>
              {localExperience
                ? localExperience.panelTitle
                : mode === "access_request"
                  ? "Choose the identity you want reviewed"
                  : "Choose a sign-in method"}
            </h2>
            <p className="auth-panel-copy">
              {localExperience
                ? localExperience.panelCopy
                : mode === "access_request"
                  ? "Choose the provider you want linked to your access request."
                  : "Choose the provider linked to your ParetoProof account."}
            </p>
            <div className="auth-provider-list">
              {localExperience ? (
                localExperience.actions.map((action) => (
                  <a className="auth-provider-button" href={action.href} key={action.title}>
                    <span className="auth-provider-mark" aria-hidden="true">
                      <AppIcon name={action.icon} />
                    </span>
                    <span>
                      <strong>{action.title}</strong>
                      <small>{action.copy}</small>
                    </span>
                    <span className="auth-provider-arrow" aria-hidden="true">
                      <AppIcon name="arrow-right" />
                    </span>
                  </a>
                ))
              ) : (
                <>
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
                </>
              )}
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
            {localExperience
              ? localExperience.footerText
              : mode === "access_request"
                ? "Already have an account? Use the sign-in entry instead."
                : "New here? Request contributor access to get started."}
          </p>
          {!localExperience?.footerCta ? null : (
            <a className="button" href={localExperience.footerCta.href}>
              {localExperience.footerCta.label}
            </a>
          )}
          {!localExperience ? (
            <a
              className="button"
              href={mode === "access_request" ? approvedSignInUrl : accessRequestUrl}
            >
              {mode === "access_request"
                ? "Approved contributor sign in"
                : "Request collaborator access"}
            </a>
          ) : null}
          <a className="button button-secondary" href={buildPublicUrl("/")}>
            {publicHomeLabel}
          </a>
        </div>
      </section>
    </main>
  );
}
