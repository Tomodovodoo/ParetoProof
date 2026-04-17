import type {
  PortalAccessRecoveryInput,
  PortalAccessRequestInput,
  PortalRole
} from "@paretoproof/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "../components/app-icon";
import { getApiBaseUrl } from "../lib/api-base-url";
import { fetchApi, portalAuthExpiredEventName } from "../lib/api-fetch";
import { createApiFormBody } from "../lib/api-form";
import { isLocalDevelopmentLocation } from "../lib/local-development";
import { resolvePortalRouteRedirect } from "../lib/portal-route-access";
import { readWebRuntimeEnv } from "../lib/runtime-env";
import { AccessRequestScreen } from "./access-request-screen";
import {
  reducePortalStateAfterAuthExpiry,
  type PortalAccessState
} from "./portal-bootstrap-state";
import {
  buildPortalUrl,
  buildAuthUrl,
  buildPublicUrl,
  getCurrentRelativeUrl
} from "../lib/surface";
import { PortalShell } from "./portal-shell";

type PortalMeResponse = {
  access: {
    email: string | null;
    role?: PortalRole | null;
    reason?:
      | "access_request_required"
      | "identity_recovery_required"
      | "rejected_or_withdrawn"
      | "unknown_identity";
    status: "approved" | "pending" | "denied";
  };
  identity: {
    provider: "cloudflare_one_time_pin" | "cloudflare_github" | "cloudflare_google" | null;
  } | null;
};

type PortalMutationAction = "access_request" | "identity_recovery";

type PortalMutationErrorPayload = {
  error?: string;
};

type PortalBootstrapFetchResponse = Pick<Response, "json" | "ok" | "status" | "type">;
type PortalBootstrapFetcher = (
  input: string,
  init: RequestInit
) => Promise<PortalBootstrapFetchResponse>;

export function derivePortalRoles(role: string | null | undefined) {
  return role ? [role] : [];
}

export async function fetchPortalBootstrapState(
  apiBaseUrl: string,
  options?: {
    fetcher?: PortalBootstrapFetcher;
    signal?: AbortSignal;
  }
): Promise<PortalAccessState> {
  const fetcher = options?.fetcher ?? fetchApi;
  const response = await fetcher(`${apiBaseUrl}/portal/me`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    },
    redirect: "manual",
    signal: options?.signal
  });

  if (response.type === "opaqueredirect" || response.status === 401) {
    return { status: "unauthenticated" };
  }

  if (!response.ok) {
    throw new Error(`Portal bootstrap failed with ${response.status}.`);
  }

  const payload = (await response.json()) as PortalMeResponse;

  if (shouldRestartPortalAuthForMissingProvider(payload)) {
    return { status: "unauthenticated" };
  }

  if (payload.access.status === "approved") {
    return {
      email: payload.access.email,
      role: payload.access.role ?? null,
      status: "approved"
    };
  }

  if (payload.access.status === "pending") {
    return {
      email: payload.access.email,
      status: "pending"
    };
  }

  return {
    email: payload.access.email,
    reason: payload.access.reason ?? "unknown_identity",
    status: "denied"
  };
}

export async function recoverPortalStateAfterAuthExpiry(
  currentState: PortalAccessState,
  apiBaseUrl: string,
  options?: {
    fetcher?: PortalBootstrapFetcher;
    localApiFallback?: boolean;
    signal?: AbortSignal;
  }
): Promise<PortalAccessState> {
  const reducedState = reducePortalStateAfterAuthExpiry(currentState);

  if (reducedState === currentState || reducedState.status !== "loading") {
    return reducedState;
  }

  try {
    return await fetchPortalBootstrapState(apiBaseUrl, options);
  } catch (error) {
    return buildPortalBootstrapErrorState(error, {
      apiBaseUrl,
      localApiFallback: options?.localApiFallback ?? false
    });
  }
}

function parseDeniedReason(
  reason: string | null
): PortalMeResponse["access"]["reason"] | null {
  if (
    reason === "access_request_required" ||
    reason === "identity_recovery_required" ||
    reason === "rejected_or_withdrawn" ||
    reason === "unknown_identity"
  ) {
    return reason;
  }

  return null;
}

function readRouteDeniedReason(search = window.location.search) {
  const reason = new URLSearchParams(search).get("reason");

  return reason === "insufficient_role" ? reason : null;
}

type PortalBootstrapErrorContext = {
  apiBaseUrl: string;
  localApiFallback: boolean;
};

function isNetworkFetchFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(
    error.message
  );
}

function isUsingImplicitLocalPortalApi() {
  return isLocalDevelopmentLocation(window.location) && !readWebRuntimeEnv().apiBaseUrl;
}

export function buildPortalBootstrapErrorState(
  error: unknown,
  context: PortalBootstrapErrorContext
): Extract<PortalAccessState, { status: "error" }> {
  if (isNetworkFetchFailure(error) && context.localApiFallback) {
    return {
      kind: "local_api_unavailable",
      message: `This local portal preview is targeting ${context.apiBaseUrl}, but no API responded. Start the local API there or set VITE_API_BASE_URL to a reachable backend before using portal routes.`,
      status: "error"
    };
  }

  if (isNetworkFetchFailure(error)) {
    return {
      kind: "portal_unavailable",
      message:
        "The portal could not reach the API right now. Try again in a moment. If the handoff still feels stuck, restart from the auth entry.",
      status: "error"
    };
  }

  if (error instanceof Error) {
    return {
      kind: "portal_unavailable",
      message:
        "The portal could not finish loading right now. Try again in a moment. If the handoff still feels stuck, restart from the auth entry.",
      status: "error"
    };
  }

  return {
    kind: "portal_unavailable",
    message: "The portal could not finish loading right now. Try again in a moment.",
    status: "error"
  };
}

export function mapPortalMutationErrorMessage(
  action: PortalMutationAction,
  status: number,
  errorCode: string | null
) {
  if (errorCode === "identity_provider_required") {
    return "The sign-in provider could not be verified. Restart from the auth entry and choose GitHub or Google again.";
  }

  return action === "access_request"
    ? `Access request failed with ${status}.`
    : `Access recovery failed with ${status}.`;
}

async function readPortalMutationErrorMessage(
  response: Pick<Response, "json" | "status">,
  action: PortalMutationAction
) {
  let errorCode: string | null = null;

  try {
    errorCode = ((await response.json()) as PortalMutationErrorPayload).error ?? null;
  } catch {
    errorCode = null;
  }

  return mapPortalMutationErrorMessage(action, response.status, errorCode);
}

export function shouldRestartPortalAuthForMissingProvider(
  payload: PortalMeResponse
) {
  return (
    payload.access.status === "denied" &&
    payload.access.reason === "identity_recovery_required" &&
    payload.identity?.provider === null
  );
}

export function PortalBootstrap() {
  const [state, setState] = useState<PortalAccessState>({ status: "loading" });
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const localPreviewMode = useMemo(() => isLocalDevelopmentLocation(window.location), []);
  const localApiFallback = useMemo(() => isUsingImplicitLocalPortalApi(), []);
  const currentRelativeUrl = useMemo(() => getCurrentRelativeUrl(), []);
  const recoveryInFlightRef = useRef(false);
  const stateRef = useRef<PortalAccessState>(state);
  const routeDeniedReason = readRouteDeniedReason();
  const routeRedirectTarget = useMemo(() => {
    if (
      state.status === "loading" ||
      state.status === "error" ||
      state.status === "unauthenticated"
    ) {
      return null;
    }

      return resolvePortalRouteRedirect({
        pathname: window.location.pathname,
        reason:
          state.status === "denied"
            ? state.reason
            : routeDeniedReason ?? undefined,
        roles: state.status === "approved" ? derivePortalRoles(state.role) : [],
        search: window.location.search,
        status: state.status
      });
  }, [routeDeniedReason, state]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadAccessState() {
      try {
        setState(
          await fetchPortalBootstrapState(apiBaseUrl, {
            signal: controller.signal
          })
        );
      } catch (error) {
        if (controller.signal.aborted || !active) {
          return;
        }

        setState(
          buildPortalBootstrapErrorState(error, {
            apiBaseUrl,
            localApiFallback
          })
        );
      }
    }

    void loadAccessState();

    const handlePortalAuthExpired = () => {
      if (recoveryInFlightRef.current) {
        return;
      }

      const currentState = stateRef.current;
      const reducedState = reducePortalStateAfterAuthExpiry(currentState);

      if (reducedState === currentState || reducedState.status !== "loading") {
        setState(reducedState);
        return;
      }

      recoveryInFlightRef.current = true;
      setState(reducedState);

      void recoverPortalStateAfterAuthExpiry(currentState, apiBaseUrl, {
        localApiFallback,
        signal: controller.signal
      })
        .then((recoveredState) => {
          if (controller.signal.aborted || !active) {
            return;
          }

          setState(recoveredState);
        })
        .finally(() => {
          recoveryInFlightRef.current = false;
        });
    };

    window.addEventListener(portalAuthExpiredEventName, handlePortalAuthExpired);

    return () => {
      active = false;
      controller.abort();
      window.removeEventListener(portalAuthExpiredEventName, handlePortalAuthExpired);
    };
  }, [apiBaseUrl, localApiFallback]);

  useEffect(() => {
    if (state.status !== "unauthenticated" || localPreviewMode) {
      return;
    }

    window.location.replace(buildAuthUrl(currentRelativeUrl));
  }, [currentRelativeUrl, localPreviewMode, state]);

  useEffect(() => {
    if (!routeRedirectTarget) {
      return;
    }

    window.location.replace(routeRedirectTarget);
  }, [routeRedirectTarget]);

  async function submitAccessRequest(payload: PortalAccessRequestInput) {
    const response = await fetchApi(`${apiBaseUrl}/portal/access-requests`, {
      body: createApiFormBody({
        rationale: payload.rationale ?? "",
        requestedRole: payload.requestedRole
      }),
      credentials: "include",
      headers: {
        Accept: "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(await readPortalMutationErrorMessage(response, "access_request"));
    }

    setState({
      email: state.status === "denied" || state.status === "pending" ? state.email : null,
      status: "pending"
    });
    window.location.replace(buildPortalUrl("/pending"));
  }

  async function submitAccessRecovery(payload: PortalAccessRecoveryInput) {
    const response = await fetchApi(`${apiBaseUrl}/portal/access-recovery`, {
      body: createApiFormBody({
        rationale: payload.rationale ?? ""
      }),
      credentials: "include",
      headers: {
        Accept: "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(await readPortalMutationErrorMessage(response, "identity_recovery"));
    }

    setState({
      email: state.status === "denied" || state.status === "pending" ? state.email : null,
      status: "pending"
    });
    window.location.replace(buildPortalUrl("/pending"));
  }

  if (state.status === "loading") {
    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Checking access"
        body="Resolving your Cloudflare Access identity and portal approval state."
      />
    );
  }

  if (state.status === "unauthenticated") {
    if (localPreviewMode) {
      return renderLocalPortalUnauthenticatedCard(currentRelativeUrl);
    }

    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Redirecting to sign in"
        body="The portal only loads after authentication. You are being sent to the auth entrypoint now."
        actions={[{ href: buildAuthUrl(currentRelativeUrl), label: "Continue to sign in" }]}
      />
    );
  }

  if (state.status === "pending") {
    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Approval pending"
        body={`Signed in${state.email ? ` as ${state.email}` : ""}, but your contributor access is still pending review.`}
      />
    );
  }

  if (state.status === "denied") {
    if (
      state.reason === "access_request_required" &&
      window.location.pathname === "/access-request"
    ) {
      return (
        <AccessRequestScreen
          email={state.email}
          onSubmit={submitAccessRequest}
        />
      );
    }

    if (state.reason === "identity_recovery_required") {
      return (
        <AccessRequestScreen
          email={state.email}
          mode="identity_recovery"
          onSubmit={submitAccessRecovery}
        />
      );
    }

    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Access denied"
        body={`Signed in${state.email ? ` as ${state.email}` : ""}, but this account is not allowed to open the portal.`}
        actions={
          state.reason === "access_request_required"
            ? [{
                href: buildPortalUrl("/access-request"),
                label: "Request contributor access"
              }]
            : undefined
        }
      />
    );
  }

  if (
    state.status === "approved" &&
    window.location.pathname === "/denied" &&
    routeDeniedReason === "insufficient_role"
  ) {
    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Permission denied"
        body={`Signed in${state.email ? ` as ${state.email}` : ""}, but your current portal role does not allow this area.`}
        actions={[{ href: buildPortalUrl("/"), label: "Return to portal home" }]}
      />
    );
  }

  if (state.status === "error") {
    return renderPortalBootstrapErrorCard(state, currentRelativeUrl);
  }

  return (
    <PortalShell
      email={state.email}
      roles={derivePortalRoles(state.role)}
    />
  );
}

export function renderPortalBootstrapErrorCard(
  state: Extract<PortalAccessState, { status: "error" }>,
  currentRelativeUrl: string
) {
  const localPreviewMode = isLocalDevelopmentLocation(window.location);

  return (
    <PortalStatusCard
      eyebrow="Portal"
      title={
        state.kind === "local_api_unavailable"
          ? "Local API unavailable"
          : "Portal unavailable"
      }
      body={state.message}
      actions={[
        {
          href: buildPortalUrl(currentRelativeUrl),
          label:
            state.kind === "local_api_unavailable" ? "Retry after starting API" : "Retry portal"
        },
        {
          href:
            state.kind === "local_api_unavailable"
              ? buildAuthUrl(currentRelativeUrl)
              : buildPublicUrl("/"),
          label:
            state.kind === "local_api_unavailable"
              ? "Open local auth guidance"
              : localPreviewMode
                ? "Back to local home"
                : "Back to paretoproof.com",
          variant: "secondary"
        }
      ]}
    />
  );
}

export function renderLocalPortalUnauthenticatedCard(currentRelativeUrl: string) {
  return (
    <PortalStatusCard
      eyebrow="Portal"
      title="Local preview needs auth context"
      body="This localhost portal route did not receive an authenticated access state from the API. Open the local auth guidance to choose the right preview path, or return to the public site."
      actions={[
        {
          href: buildAuthUrl(currentRelativeUrl),
          label: "Open local auth guidance"
        },
        {
          href: buildPublicUrl("/"),
          label: "Back to local home",
          variant: "secondary"
        }
      ]}
    />
  );
}

type PortalStatusCardProps = {
  actions?: Array<{
    href: string;
    label: string;
    variant?: "primary" | "secondary";
  }>;
  body: string;
  eyebrow: string;
  title: string;
};

function PortalStatusCard({ actions = [], body, eyebrow, title }: PortalStatusCardProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-polished auth-status-card">
        <p className="eyebrow">
          <span className="inline-icon" aria-hidden="true">
            <AppIcon name="shield" />
          </span>
          {eyebrow}
        </p>
        <h1>{title}</h1>
        <p>{body}</p>
        {actions.length ? (
          <div className="auth-status-actions">
            {actions.map((action) => (
              <a
                className={`button${
                  action.variant === "secondary" ? " button-secondary" : ""
                }`}
                href={action.href}
                key={`${action.href}:${action.label}`}
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
