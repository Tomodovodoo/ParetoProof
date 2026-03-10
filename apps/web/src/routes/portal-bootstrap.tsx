import type { PortalAccessRequestInput } from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../lib/api-base-url";
import { resolvePortalRouteRedirect } from "../lib/portal-route-access";
import { AccessRequestScreen } from "./access-request-screen";
import {
  buildPortalUrl,
  buildAuthUrl,
  getCurrentRelativeUrl,
  isLocalHostname
} from "../lib/surface";
import { PortalShell } from "./portal-shell";

type PortalAccessState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "approved"; email: string | null; roles: string[] }
  | { status: "pending"; email: string | null }
  | {
      email: string | null;
      reason:
        | "access_request_required"
        | "identity_recovery_required"
        | "rejected_or_withdrawn"
        | "unknown_identity";
      status: "denied";
    }
  | { status: "error"; message: string };

type PortalMeResponse = {
  access: {
    email: string | null;
    roles?: string[];
    reason?:
      | "access_request_required"
      | "identity_recovery_required"
      | "rejected_or_withdrawn"
      | "unknown_identity";
    status: "approved" | "pending" | "denied";
  };
};

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
      reason:
        (params.get("reason") as PortalMeResponse["access"]["reason"] | null) ??
        "access_request_required",
      status: "denied"
    };
  }

  if (accessState === "approved") {
    return {
      email: params.get("email"),
      roles: (params.get("roles") ?? "")
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean),
      status: "approved"
    };
  }

  return null;
}

export function PortalBootstrap() {
  const [state, setState] = useState<PortalAccessState>({ status: "loading" });
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const currentRelativeUrl = useMemo(() => getCurrentRelativeUrl(), []);
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
      reason: state.status === "denied" ? state.reason : undefined,
      roles: state.status === "approved" ? state.roles : [],
      status: state.status
    });
  }, [state]);

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
        const response = await fetch(`${apiBaseUrl}/portal/me`, {
          credentials: "include",
          headers: {
            Accept: "application/json"
          },
          signal: controller.signal
        });

        if (response.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }

        if (!response.ok) {
          throw new Error(`Portal bootstrap failed with ${response.status}.`);
        }

        const payload = (await response.json()) as PortalMeResponse;

        if (payload.access.status === "approved") {
          setState({
            email: payload.access.email,
            roles: payload.access.roles ?? [],
            status: "approved"
          });
          return;
        }

        if (payload.access.status === "pending") {
          setState({
            email: payload.access.email,
            status: "pending"
          });
          return;
        }

        setState({
          email: payload.access.email,
          reason: payload.access.reason ?? "unknown_identity",
          status: "denied"
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          message: error instanceof Error ? error.message : "Unknown portal bootstrap error.",
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
      window.history.replaceState({}, "", buildPortalUrl("/pending"));
      return;
    }

    const response = await fetch(`${apiBaseUrl}/portal/access-requests`, {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Access request failed with ${response.status}.`);
    }

    setState({
      email: state.status === "denied" || state.status === "pending" ? state.email : null,
      status: "pending"
    });
    window.location.replace(buildPortalUrl("/pending"));
  }

  async function submitAccessRecovery(payload: { rationale: string | null }) {
    if (isLocalHostname(window.location.hostname)) {
      setState({
        email: state.status === "denied" || state.status === "pending" ? state.email : null,
        status: "pending"
      });
      window.history.replaceState({}, "", buildPortalUrl("/pending"));
      return;
    }

    const response = await fetch(`${apiBaseUrl}/portal/access-recovery`, {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Access recovery failed with ${response.status}.`);
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
    <PortalShell email={state.email} roles={state.roles} />
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
      <section className="auth-card">
        <p className="eyebrow">{eyebrow}</p>
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
