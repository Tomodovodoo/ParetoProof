import { stripSyntheticLocalAuthParams } from "../lib/local-development";

export type PortalAccessState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "approved"; email: string | null; role: string | null }
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
  | {
      status: "error";
      kind?: "local_api_unavailable" | "portal_unavailable";
      message: string;
    };

export function buildLocalPendingPortalUrl(currentSearch = window.location.search) {
  const nextParams = stripSyntheticLocalAuthParams(new URLSearchParams(currentSearch));

  nextParams.set("surface", "portal");

  const nextSearch = nextParams.toString();
  return `/pending${nextSearch ? `?${nextSearch}` : ""}`;
}

export function reducePortalStateAfterAuthExpiry(currentState: PortalAccessState) {
  if (currentState.status === "loading" || currentState.status === "unauthenticated") {
    return currentState;
  }

  return { status: "loading" } satisfies PortalAccessState;
}
