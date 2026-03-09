import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../lib/api-base-url";
import {
  buildAuthUrl,
  getCurrentRelativeUrl,
  isLocalHostname
} from "../lib/surface";

type PortalAccessState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "approved"; email: string | null; roles: string[] }
  | { status: "pending"; email: string | null }
  | { status: "denied"; email: string | null }
  | { status: "error"; message: string };

type PortalMeResponse = {
  access: {
    email: string | null;
    roles?: string[];
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
    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Access denied"
        body={`Signed in${state.email ? ` as ${state.email}` : ""}, but this account is not allowed to open the portal.`}
      />
    );
  }

  if (state.status === "error") {
    return (
      <PortalStatusCard
        eyebrow="Portal"
        title="Portal unavailable"
        body={state.message}
        action={{ href: buildAuthUrl(currentRelativeUrl), label: "Return to sign in" }}
      />
    );
  }

  return (
    <main className="portal-shell-preview">
      <section className="portal-preview-card">
        <p className="eyebrow">Portal</p>
        <h1>Authentication complete</h1>
        <p>
          Signed in{state.email ? ` as ${state.email}` : ""}. The portal shell
          and role-aware dashboard layout land next, but the host-aware auth
          entry flow is now active.
        </p>
        <p className="role-chip">Roles: {state.roles.join(", ") || "none"}</p>
      </section>
    </main>
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
