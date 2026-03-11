import {
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema,
  type PortalAccessRequestSummary,
  type PortalAdminApprovedRole
} from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import { getApiBaseUrl } from "../lib/api-base-url";
import { createApiFormBody } from "../lib/api-form";
import { usePortalPolling } from "../lib/portal-freshness";
import { isLocalHostname } from "../lib/surface";

type PortalAccessRequestPanelProps = {
  email: string | null;
};

type RequestDraftState = {
  approvedRole: PortalAdminApprovedRole;
  decisionNote: string;
};

const localAccessRequestsStorageKey = "paretoproof.portal.admin.accessRequests";

function createLocalRequest(
  id: string,
  email: string,
  requestedRole: PortalAdminApprovedRole
) {
  return {
    createdAt: new Date().toISOString(),
    decisionNote: null,
    email,
    id,
    requestKind: "access_request",
    rationale: `Contributor access request for ${email}.`,
    requestedRole,
    reviewedAt: null,
    status: "pending"
  } satisfies PortalAccessRequestSummary;
}

function readLocalAccessRequests() {
  const storedValue = window.localStorage.getItem(localAccessRequestsStorageKey);

  if (!storedValue) {
    return [
      createLocalRequest(
        "11111111-1111-4111-8111-111111111111",
        "helper@paretoproof.local",
        "helper"
      ),
      createLocalRequest(
        "22222222-2222-4222-8222-222222222222",
        "collaborator@paretoproof.local",
        "collaborator"
      ),
      createLocalRequest(
        "33333333-3333-4333-8333-333333333333",
        "second-helper@paretoproof.local",
        "helper"
      )
    ];
  }

  return (JSON.parse(storedValue) as PortalAccessRequestSummary[]).map((item) => ({
    ...item,
    requestKind: item.requestKind ?? "access_request"
  }));
}

function writeLocalAccessRequests(items: PortalAccessRequestSummary[]) {
  window.localStorage.setItem(localAccessRequestsStorageKey, JSON.stringify(items));
}

function sortRequests(items: PortalAccessRequestSummary[]) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function PortalAccessRequestPanel({ email }: PortalAccessRequestPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, RequestDraftState>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutatingId, setIsMutatingId] = useState<string | null>(null);
  const [requests, setRequests] = useState<PortalAccessRequestSummary[]>([]);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const {
    isPolling,
    lastUpdatedAt,
    markUpdated,
    pollNow
  } = usePortalPolling({
    enabled: !isLoading && isMutatingId === null,
    onPoll: refreshRequests,
    routeId: "portal.admin.access-requests"
  });

  function applyRequests(nextItems: PortalAccessRequestSummary[]) {
    setDrafts((currentDrafts) => {
      const nextDrafts: Record<string, RequestDraftState> = {};

      for (const item of nextItems) {
        nextDrafts[item.id] = currentDrafts[item.id] ?? {
          approvedRole:
            item.requestedRole === "collaborator" ? "collaborator" : "helper",
          decisionNote: item.decisionNote ?? ""
        };
      }

      return nextDrafts;
    });
    setRequests(nextItems);
  }

  async function fetchRequestsSnapshot() {
    if (isLocalHostname(window.location.hostname)) {
      const localItems = sortRequests(readLocalAccessRequests());
      writeLocalAccessRequests(localItems);
      return localItems;
    }

    const response = await fetch(`${apiBaseUrl}/portal/admin/access-requests`, {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Access-request load failed with ${response.status}.`);
    }

    const payload = (await response.json()) as {
      items: PortalAccessRequestSummary[];
    };

    return sortRequests(payload.items);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      try {
        const nextItems = await fetchRequestsSnapshot();

        if (cancelled) {
          return;
        }

        setErrorMessage(null);
        applyRequests(nextItems);
        markUpdated();
        setIsLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The access-request queue could not be loaded."
        );
        setIsLoading(false);
      }
    }

    void loadRequests();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  async function refreshRequests() {
    try {
      const nextItems = await fetchRequestsSnapshot();
      setErrorMessage(null);
      applyRequests(nextItems);
      markUpdated();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The access-request queue could not be refreshed."
      );
      throw error;
    }
  }

  async function handleDecision(
    requestItem: PortalAccessRequestSummary,
    action: "approve" | "reject"
  ) {
    const draft = drafts[requestItem.id] ?? {
      approvedRole:
        requestItem.requestedRole === "collaborator" ? "collaborator" : "helper",
      decisionNote: requestItem.decisionNote ?? ""
    };

    try {
      setErrorMessage(null);
      setIsMutatingId(requestItem.id);

      if (action === "approve") {
        const parsed = portalAdminAccessRequestApproveInputSchema.safeParse({
          approvedRole: draft.approvedRole,
          decisionNote: draft.decisionNote
        });

        if (!parsed.success) {
          throw new Error("Check the approval details and try again.");
        }

        if (isLocalHostname(window.location.hostname)) {
          const nextItems = readLocalAccessRequests().map((item) =>
            item.id === requestItem.id
              ? {
                  ...item,
                  decisionNote: parsed.data.decisionNote,
                  reviewedAt: new Date().toISOString(),
                  status: "approved" as const
                }
              : item
          );
          writeLocalAccessRequests(nextItems);
          await refreshRequests();
          return;
        }

        const response = await fetch(
          `${apiBaseUrl}/portal/admin/access-requests/${requestItem.id}/approve`,
          {
            body: createApiFormBody({
              approvedRole: parsed.data.approvedRole,
              decisionNote: parsed.data.decisionNote ?? ""
            }),
            credentials: "include",
            headers: {
              Accept: "application/json"
            },
            method: "POST"
          }
        );

        if (!response.ok) {
          throw new Error(`Approval failed with ${response.status}.`);
        }

        await refreshRequests();
        return;
      }

      const parsed = portalAdminAccessRequestRejectInputSchema.safeParse({
        decisionNote: draft.decisionNote
      });

      if (!parsed.success) {
        throw new Error("Check the rejection note and try again.");
      }

      if (isLocalHostname(window.location.hostname)) {
        const nextItems = readLocalAccessRequests().map((item) =>
          item.id === requestItem.id
            ? {
                ...item,
                decisionNote: parsed.data.decisionNote,
                reviewedAt: new Date().toISOString(),
                status: "rejected" as const
              }
            : item
        );
        writeLocalAccessRequests(nextItems);
        await refreshRequests();
        return;
      }

      const response = await fetch(
        `${apiBaseUrl}/portal/admin/access-requests/${requestItem.id}/reject`,
        {
          body: createApiFormBody({
            decisionNote: parsed.data.decisionNote ?? ""
          }),
          credentials: "include",
          headers: {
            Accept: "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error(`Rejection failed with ${response.status}.`);
      }

      await refreshRequests();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The access-request decision failed."
      );
    } finally {
      setIsMutatingId(null);
    }
  }

  if (isLoading) {
    return (
      <section className="portal-grid">
        <article className="portal-panel">
          <p className="eyebrow">Admin review</p>
          <h2>Loading access queue</h2>
          <p>Fetching the latest contributor requests for admin review.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="portal-grid portal-grid-stack">
      <article className="portal-panel">
        <p className="eyebrow">Admin queue</p>
        <h2>Contributor access requests</h2>
        <p>
          Signed in{email ? ` as ${email}` : ""}. Review pending requests here and issue
          the contributor role that should be active immediately after approval.
        </p>
        <PortalFreshnessCard
          isRefreshing={isPolling || isMutatingId !== null}
          lastUpdatedAt={lastUpdatedAt}
          onRefresh={() => {
            void pollNow().catch(() => {
              // refreshRequests already surfaces the error to the panel state
            });
          }}
          routeId="portal.admin.access-requests"
        />
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </article>

      <div className="portal-request-list">
        {requests.length === 0 ? (
          <article className="portal-panel">
            <p className="eyebrow">Queue</p>
            <h2>No requests waiting</h2>
            <p>The contributor approval queue is currently empty.</p>
          </article>
        ) : (
          requests.map((requestItem) => {
            const draft = drafts[requestItem.id] ?? {
              approvedRole:
                requestItem.requestedRole === "collaborator" ? "collaborator" : "helper",
              decisionNote: requestItem.decisionNote ?? ""
            };
            const isPending = requestItem.status === "pending";
            const isMutating = isMutatingId === requestItem.id;
            const isRecoveryRequest = requestItem.requestKind === "identity_recovery";

            return (
              <article className="portal-panel portal-request-card" key={requestItem.id}>
                <div className="portal-request-header">
                  <div>
                    <p className="portal-action-title">{requestItem.email}</p>
                    <p className="portal-action-copy">
                      {isRecoveryRequest
                        ? `Recovery request - Preserve ${requestItem.requestedRole}`
                        : `Requested role: ${requestItem.requestedRole}`}
                    </p>
                  </div>
                  <span className="portal-action-badge">{requestItem.status}</span>
                </div>

                <p className="portal-request-meta">
                  Created {new Date(requestItem.createdAt).toLocaleString()}
                  {requestItem.reviewedAt
                    ? ` - Reviewed ${new Date(requestItem.reviewedAt).toLocaleString()}`
                    : ""}
                </p>

                {requestItem.rationale ? (
                  <p className="portal-request-rationale">{requestItem.rationale}</p>
                ) : (
                  <p className="portal-panel-muted">No rationale supplied.</p>
                )}

                <div className="auth-form">
                  {!isRecoveryRequest ? (
                    <label className="auth-field">
                      <span>Approve as</span>
                      <select
                        disabled={!isPending || isMutating}
                        onChange={(event) => {
                          const approvedRole = event.currentTarget
                            .value as PortalAdminApprovedRole;
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [requestItem.id]: {
                              ...draft,
                              approvedRole
                            }
                          }));
                        }}
                        value={draft.approvedRole}
                      >
                        <option value="helper">Helper</option>
                        <option value="collaborator">Collaborator</option>
                      </select>
                    </label>
                  ) : null}

                  <label className="auth-field">
                    <span>Decision note</span>
                    <textarea
                      disabled={!isPending || isMutating}
                      onChange={(event) => {
                        const decisionNote = event.currentTarget.value;
                        setDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [requestItem.id]: {
                            ...draft,
                            decisionNote
                          }
                        }));
                      }}
                      rows={3}
                      value={draft.decisionNote}
                    />
                  </label>
                </div>

                <div className="portal-request-actions">
                  <button
                    className="button"
                    disabled={!isPending || isMutating}
                    onClick={() => {
                      void handleDecision(requestItem, "approve");
                    }}
                    type="button"
                  >
                    {isMutating
                      ? "Saving..."
                      : isRecoveryRequest
                        ? "Link identity"
                        : "Approve"}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!isPending || isMutating}
                    onClick={() => {
                      void handleDecision(requestItem, "reject");
                    }}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
