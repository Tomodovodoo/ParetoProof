import type {
  PortalAccessRecoveryInput,
  PortalAccessRequestInput,
  PortalRole
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "../components/app-icon";
import { getApiBaseUrl } from "../lib/api-base-url";
import { fetchApi, portalAuthExpiredEventName } from "../lib/api-fetch";
import { createApiFormBody } from "../lib/api-form";
import { resolvePortalRouteRedirect } from "../lib/portal-route-access";
import { AccessRequestScreen } from "./access-request-screen";
import {
  buildLocalPendingPortalUrl,
  reducePortalStateAfterAuthExpiry,
  type PortalAccessState
} from "./portal-bootstrap-state";
import {
  buildPortalUrl,
  buildAuthUrl,
  getCurrentRelativeUrl,
  isLocalHostname
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

function readLocalAccessOverride(): PortalAccessState | null {
  if (!isLocalHostname(window.location.hostname)) {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const accessState = params.get("access");

  if (accessState === "unauthenticated") {
    return { status: "unauthenticated" };
  }

  if (accessState === "pending") {
    return {
      email: params.get("email"),
      status: "pending"
    };
  }

  if (accessState === "denied") {
    return {
      email: params.get("email"),
      reason: parseDeniedReason(params.get("reason")) ?? "access_request_required",
      status: "denied"
    };
  }

  if (accessState === "approved") {
    const approvedRole =
      params.get("role") ??
      (params.get("roles") ?? "")
        .split(",")
        .map((role) => role.trim())
        .find(Boolean) ??
      null;

    return {
      email: params.get("email"),
      role: approvedRole,
      status: "approved"
    };
  }

  return null;
}

function formatPortalBootstrapError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "The portal could not reach the API right now. Try again in a moment. If the handoff still feels stuck, restart from the auth entry.";
    }

    return "The portal could not finish loading right now. Try again in a moment. If the handoff still feels stuck, restart from the auth entry.";
  }

  return "The portal could not finish loading right now. Try again in a moment.";
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
  const currentRelativeUrl = useMemo(() => getCurrentRelativeUrl(), []);
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
    const controller = new AbortController();
    const localAccessOverride = readLocalAccessOverride();

    if (localAccessOverride) {
      setState(localAccessOverride);
      return () => {
        controller.abort();
      };
    }

    async function loadAccessState() {
      try {
        setState(
          await fetchPortalBootstrapState(apiBaseUrl, {
            signal: controller.signal
          })
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          message: formatPortalBootstrapError(error),
          status: "error"
        });
      }
    }

    void loadAccessState();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const handlePortalAuthExpired = () => {
      setState((currentState) => reducePortalStateAfterAuthExpiry(currentState));
    };

    window.addEventListener(portalAuthExpiredEventName, handlePortalAuthExpired);

    return () => {
      window.removeEventListener(portalAuthExpiredEventName, handlePortalAuthExpired);
    };
  }, []);

  useEffect(() => {
    if (state.status !== "unauthenticated") {
      return;
    }

    window.location.replace(buildAuthUrl(currentRelativeUrl));
  }, [currentRelativeUrl, state]);

  useEffect(() => {
    if (!routeRedirectTarget) {
      return;
    }

    window.location.replace(routeRedirectTarget);
  }, [routeRedirectTarget]);

  async function submitAccessRequest(payload: PortalAccessRequestInput) {
    if (isLocalHostname(window.location.hostname)) {
      setState({
        email: state.status === "denied" || state.status === "pending" ? state.email : null,
        status: "pending"
      });
      window.history.replaceState({}, "", buildLocalPendingPortalUrl());
      return;
    }

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
    if (isLocalHostname(window.location.hostname)) {
      setState({
        email: state.status === "denied" || state.status === "pending" ? state.email : null,
        status: "pending"
      });
      window.history.replaceState({}, "", buildLocalPendingPortalUrl());
      return;
    }

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
    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Redirecting to sign in"
        body="The portal only loads after authentication. You are being sent to the auth entrypoint now."
        action={{ href: buildAuthUrl(currentRelativeUrl), label: "Continue to sign in" }}
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
        action={
          state.reason === "access_request_required"
            ? {
                href: buildPortalUrl("/access-request"),
                label: "Request contributor access"
              }
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
        action={{ href: buildPortalUrl("/"), label: "Return to portal home" }}
      />
    );
  }

  if (state.status === "error") {
    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Portal unavailable"
        body={state.message}
        action={{ href: buildPortalUrl(currentRelativeUrl), label: "Retry portal" }}
      />
    );
  }

  return (
    <PortalShell
      email={state.email}
      roles={derivePortalRoles(state.role)}
    />
  );
}

type PortalStatusCardProps = {
  action?: {
    href: string;
    label: string;
  };
  body: string;
  eyebrow: string;
  title: string;
};

function PortalStatusCard({ action, body, eyebrow, title }: PortalStatusCardProps) {
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
        {action ? (
          <a className="button" href={action.href}>
            {action.label}
          </a>
        ) : null}
      </section>
    </main>
  );
}
