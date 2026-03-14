import {
  portalAdminAccessRequestApproveInputSchema,
  portalAdminAccessRequestRejectInputSchema,
  type PortalAdminAccessRequestDetail,
  type PortalAdminAccessRequestListItem,
  type PortalAdminApprovedRole,
  type PortalIdentityProvider
} from "@paretoproof/shared";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import {
  approvePortalAdminAccessRequest,
  loadPortalAdminAccessRequestDetail,
  loadPortalAdminAccessRequests,
  rejectPortalAdminAccessRequest,
  type AdminMutationResult
} from "../lib/portal-admin";
import { usePortalPolling } from "../lib/portal-freshness";
import { getApiBaseUrl } from "../lib/api-base-url";
import { useCompactLayout } from "../lib/use-compact-layout";

type PortalAccessRequestPanelProps = {
  email: string | null;
};

type RequestDraftState = {
  approvedRole: PortalAdminApprovedRole;
  decisionNote: string;
};

type RequestFilterState = {
  requestedRole: "all" | "collaborator" | "helper";
  requestKind: "all" | "access_request" | "identity_recovery";
  reviewerState: "all" | "reviewed" | "unreviewed";
  sortOrder: "newest" | "oldest" | "recently_reviewed";
  status: "all" | "approved" | "pending" | "rejected";
};

const defaultFilters: RequestFilterState = {
  requestedRole: "all",
  requestKind: "all",
  reviewerState: "all",
  sortOrder: "oldest",
  status: "all"
};

const requestStatusPriority: Record<PortalAdminAccessRequestListItem["status"], number> = {
  approved: 1,
  pending: 0,
  rejected: 2,
  withdrawn: 3
};

export function resolveSelectedAccessRequestId(
  selectedRequestId: string | null,
  filteredRequests: PortalAdminAccessRequestListItem[]
) {
  if (
    selectedRequestId &&
    filteredRequests.some((requestItem) => requestItem.id === selectedRequestId)
  ) {
    return selectedRequestId;
  }

  return filteredRequests[0]?.id ?? null;
}

export function getCompactAccessRequestSectionOrder() {
  return ["queueContent", "filterFields"] as const;
}

export function PortalAccessRequestPanel({ email }: PortalAccessRequestPanelProps) {
  const [detail, setDetail] = useState<PortalAdminAccessRequestDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RequestDraftState>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<RequestFilterState>(defaultFilters);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutatingId, setIsMutatingId] = useState<string | null>(null);
  const [requests, setRequests] = useState<PortalAdminAccessRequestListItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailActionRef = useRef<HTMLElement | null>(null);
  const pendingCompactRevealRequestIdRef = useRef<string | null>(null);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const isCompactLayout = useCompactLayout();
  const {
    isPolling,
    lastUpdatedAt,
    markUpdated,
    pollNow
  } = usePortalPolling({
    enabled: !isLoading && !isDetailLoading && isMutatingId === null,
    onPoll: refreshWorkspace,
    routeId: "portal.admin.access-requests"
  });

  const filteredRequests = useMemo(() => {
    const nextItems = requests.filter((requestItem) => {
      if (filters.status !== "all" && requestItem.status !== filters.status) {
        return false;
      }

      if (
        filters.requestKind !== "all" &&
        requestItem.requestKind !== filters.requestKind
      ) {
        return false;
      }

      if (
        filters.requestedRole !== "all" &&
        requestItem.requestedRole !== filters.requestedRole
      ) {
        return false;
      }

      if (filters.reviewerState === "reviewed" && requestItem.reviewer === null) {
        return false;
      }

      if (filters.reviewerState === "unreviewed" && requestItem.reviewer !== null) {
        return false;
      }

      return true;
    });

    return [...nextItems].sort((left, right) => {
      const statusOrder =
        requestStatusPriority[left.status] - requestStatusPriority[right.status];

      if (statusOrder !== 0) {
        return statusOrder;
      }

      if (filters.sortOrder === "newest") {
        return right.createdAt.localeCompare(left.createdAt);
      }

      if (filters.sortOrder === "recently_reviewed") {
        return (right.reviewedAt ?? "").localeCompare(left.reviewedAt ?? "");
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
  }, [filters, requests]);

  const selectedRequest = useMemo(
    () =>
      filteredRequests.find((requestItem) => requestItem.id === selectedRequestId) ??
      null,
    [filteredRequests, selectedRequestId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const nextRequests = await loadPortalAdminAccessRequests(apiBaseUrl);

        if (cancelled) {
          return;
        }

        applyRequests(nextRequests);
        setErrorMessage(null);
        setIsLoading(false);
        markUpdated();
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The admin request queue could not be loaded."
        );
        setIsLoading(false);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const nextSelectedRequestId = resolveSelectedAccessRequestId(
      selectedRequestId,
      filteredRequests
    );

    if (nextSelectedRequestId === selectedRequestId) {
      return;
    }

    setSelectedRequestId(nextSelectedRequestId);
  }, [filteredRequests, selectedRequestId]);

  useEffect(() => {
    if (!selectedRequestId) {
      setDetail(null);
      setIsDetailLoading(false);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);

    async function loadDetail() {
      const currentRequestId = selectedRequestId;

      if (!currentRequestId) {
        return;
      }

      try {
        const nextDetail = await loadPortalAdminAccessRequestDetail(apiBaseUrl, currentRequestId);

        if (cancelled) {
          return;
        }

        setDetail(nextDetail);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setDetail(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The selected request could not be loaded."
        );
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, selectedRequestId]);

  useEffect(() => {
    if (
      !isCompactLayout ||
      !selectedRequestId ||
      pendingCompactRevealRequestIdRef.current !== selectedRequestId
    ) {
      return;
    }

    const detailPanel = detailActionRef.current ?? detailPanelRef.current;

    if (!detailPanel) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      detailPanel.scrollIntoView({
        behavior: "auto",
        block: "start"
      });
      pendingCompactRevealRequestIdRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isCompactLayout, selectedRequestId]);

  function applyRequests(nextItems: PortalAdminAccessRequestListItem[]) {
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

  async function refreshWorkspace() {
    const nextRequests = await loadPortalAdminAccessRequests(apiBaseUrl);

    applyRequests(nextRequests);
    markUpdated();

    if (selectedRequestId) {
      const nextDetail = await loadPortalAdminAccessRequestDetail(apiBaseUrl, selectedRequestId);
      setDetail(nextDetail);
    }
  }

  async function handleDecision(action: "approve" | "reject") {
    if (!selectedRequest) {
      return;
    }

    const draft = drafts[selectedRequest.id] ?? {
      approvedRole:
        selectedRequest.requestedRole === "collaborator" ? "collaborator" : "helper",
      decisionNote: selectedRequest.decisionNote ?? ""
    };

    const parsed =
      action === "approve"
        ? portalAdminAccessRequestApproveInputSchema.safeParse({
            approvedRole: draft.approvedRole,
            decisionNote: draft.decisionNote
          })
        : portalAdminAccessRequestRejectInputSchema.safeParse({
            decisionNote: draft.decisionNote
          });

    if (!parsed.success) {
      setErrorMessage(
        action === "approve"
          ? "Check the approval details and try again."
          : "Add a visible rejection note before submitting."
      );
      return;
    }

    try {
      setErrorMessage(null);
      setIsMutatingId(selectedRequest.id);
      const result =
        action === "approve"
          ? await approvePortalAdminAccessRequest(apiBaseUrl, selectedRequest.id, {
              approvedRole: draft.approvedRole,
              decisionNote: draft.decisionNote
            })
          : await rejectPortalAdminAccessRequest(
              apiBaseUrl,
              selectedRequest.id,
              draft.decisionNote
            );

      if (!result.ok) {
        setErrorMessage(buildMutationMessage(result));
        return;
      }

      await refreshWorkspace();
    } finally {
      setIsMutatingId(null);
    }
  }

  function revealSelectedRequestDetail(requestId: string) {
    if (isCompactLayout && requestId === selectedRequestId) {
      (detailActionRef.current ?? detailPanelRef.current)?.scrollIntoView({
        behavior: "auto",
        block: "start"
      });
      return;
    }

    pendingCompactRevealRequestIdRef.current = requestId;
    setSelectedRequestId(requestId);
  }

  if (isLoading) {
    return (
      <section className="portal-grid portal-grid-stack">
        <article className="portal-panel">
          <p className="section-tag">Admin requests</p>
          <h2>Loading request review workspace</h2>
          <p>Collecting the current queue, matched-user posture, and review context.</p>
        </article>
      </section>
    );
  }

  const introPanel = (
    <article className="portal-panel">
      <p className="section-tag">Admin requests</p>
      <h2>Request review stays anchored to one queue and one detail pane.</h2>
      <p>
        Signed in{email ? ` as ${email}` : ""}. Review access requests and recovery
        requests here, keep the request object explicit, and surface visible notes for
        every decision.
      </p>
      <PortalFreshnessCard
        isRefreshing={isPolling || isDetailLoading || isMutatingId !== null}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => {
          void pollNow().catch(() => {
            setErrorMessage("The admin request queue could not be refreshed.");
          });
        }}
        routeId="portal.admin.access-requests"
      />
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
    </article>
  );

  const filterFields = (
    <div className="portal-admin-filter-grid">
      <label className="auth-field">
        <span>Status</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as RequestFilterState["status"];
            setFilters((current) => ({
              ...current,
              status: value
            }));
          }}
          value={filters.status}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending first</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label className="auth-field">
        <span>Request kind</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as RequestFilterState["requestKind"];
            setFilters((current) => ({
              ...current,
              requestKind: value
            }));
          }}
          value={filters.requestKind}
        >
          <option value="all">All kinds</option>
          <option value="access_request">Access requests</option>
          <option value="identity_recovery">Recovery requests</option>
        </select>
      </label>
      <label className="auth-field">
        <span>Requested role</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as RequestFilterState["requestedRole"];
            setFilters((current) => ({
              ...current,
              requestedRole: value
            }));
          }}
          value={filters.requestedRole}
        >
          <option value="all">Any role</option>
          <option value="collaborator">Collaborator</option>
          <option value="helper">Helper</option>
        </select>
      </label>
      <label className="auth-field">
        <span>Reviewer state</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as RequestFilterState["reviewerState"];
            setFilters((current) => ({
              ...current,
              reviewerState: value
            }));
          }}
          value={filters.reviewerState}
        >
          <option value="all">Reviewed and unreviewed</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </label>
      <label className="auth-field">
        <span>Sort</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as RequestFilterState["sortOrder"];
            setFilters((current) => ({
              ...current,
              sortOrder: value
            }));
          }}
          value={filters.sortOrder}
        >
          <option value="oldest">Oldest submitted</option>
          <option value="newest">Newest submitted</option>
          <option value="recently_reviewed">Recently reviewed</option>
        </select>
      </label>
    </div>
  );

  const queueContent =
    filteredRequests.length === 0 ? (
      <div className="portal-admin-empty-state">
        <p className="section-tag">Empty state</p>
        <h2>No requests match the current slice.</h2>
        <p>Change the filters to bring back recently reviewed or different request kinds.</p>
      </div>
    ) : (
      <div className="portal-admin-record-list">
        {filteredRequests.map((requestItem) => {
          const isSelected = requestItem.id === selectedRequestId;

          return (
            <button
              className={`portal-admin-record${isSelected ? " portal-admin-record-active" : ""}`}
              key={requestItem.id}
              onClick={() => {
                revealSelectedRequestDetail(requestItem.id);
              }}
              type="button"
            >
              <div className="portal-admin-record-header">
                <strong>{requestItem.email}</strong>
                <span
                  className={`portal-state-badge portal-admin-status-${requestItem.status}`}
                >
                  {formatRequestStatusLabel(requestItem.status)}
                </span>
              </div>
              <p className="portal-panel-muted">
                {requestItem.requestKind === "identity_recovery"
                  ? `Identity recovery - preserve ${requestItem.requestedRole}`
                  : `Access request - ${requestItem.requestedRole}`}
              </p>
              <div className="portal-admin-meta-row">
                <span>Submitted {formatDateTime(requestItem.createdAt)}</span>
                <span>
                  {requestItem.reviewer
                    ? `Reviewed by ${requestItem.reviewer.label}`
                    : "Awaiting reviewer"}
                </span>
              </div>
              <div className="portal-filter-chip-row">
                {requestItem.matchedUserPosture ? (
                  <span className="role-chip role-chip-muted">
                    {formatAccessPostureLabel(
                      requestItem.matchedUserPosture.accessPosture
                    )}
                  </span>
                ) : null}
                {requestItem.matchedUser ? (
                  <span className="role-chip role-chip-muted">
                    User {requestItem.matchedUser.userId.slice(0, 8)}
                  </span>
                ) : (
                  <span className="role-chip role-chip-muted">No matched user</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );

  const layout = (
    <section className="portal-admin-layout">
      <article className="portal-panel portal-admin-list-panel">
        {!isCompactLayout ? (
          <div className="portal-panel-header">
            <div>
              <p className="section-tag">Queue</p>
              <h2>Scoped filters keep pending work visible.</h2>
            </div>
            <span className="role-chip role-chip-tonal">
              {filteredRequests.length} visible
            </span>
          </div>
        ) : null}

        {isCompactLayout
          ? getCompactAccessRequestSectionOrder().map((sectionId) => {
              const sections = {
                filterFields,
                queueContent
              };

              return <Fragment key={sectionId}>{sections[sectionId]}</Fragment>;
            })
          : (
              <>
                {queueContent}
                {filterFields}
              </>
            )}
      </article>

      <article className="portal-panel portal-admin-detail-panel" ref={detailPanelRef}>
        {!selectedRequest ? (
          <div className="portal-admin-empty-state">
            <p className="section-tag">Selection</p>
            <h2>Choose a request to inspect the full workflow context.</h2>
            <p>
              Request review stays local to this route, so the queue and the evidence
              stay visible together.
            </p>
          </div>
        ) : isDetailLoading || !detail ? (
          <div className="portal-admin-empty-state">
            <p className="section-tag">Selection</p>
            <h2>Loading request detail</h2>
            <p>Pulling linked identities, related history, and audit echoes.</p>
          </div>
        ) : (
          <AccessRequestDetailCard
            detail={detail}
            draft={
              drafts[detail.id] ?? {
                approvedRole:
                  detail.requestedRole === "collaborator" ? "collaborator" : "helper",
                decisionNote: detail.decisionNote ?? ""
              }
            }
            isMutating={isMutatingId === detail.id}
            onApprove={() => {
              void handleDecision("approve");
            }}
            onChangeDraft={(nextDraft) => {
              setDrafts((current) => ({
                ...current,
                [detail.id]: nextDraft
              }));
            }}
            onReject={() => {
              void handleDecision("reject");
            }}
            actionSectionRef={detailActionRef}
          />
        )}
      </article>
    </section>
  );

  return (
    <section className="portal-grid portal-grid-stack portal-grid-admin-workspace">
      {isCompactLayout ? layout : introPanel}
      {isCompactLayout ? introPanel : layout}
    </section>
  );
}

type AccessRequestDetailCardProps = {
  actionSectionRef: React.RefObject<HTMLElement | null>;
  detail: PortalAdminAccessRequestDetail;
  draft: RequestDraftState;
  isMutating: boolean;
  onApprove: () => void;
  onChangeDraft: (nextDraft: RequestDraftState) => void;
  onReject: () => void;
};

function AccessRequestDetailCard({
  actionSectionRef,
  detail,
  draft,
  isMutating,
  onApprove,
  onChangeDraft,
  onReject
}: AccessRequestDetailCardProps) {
  const isPending = detail.status === "pending";
  const isRecoveryRequest = detail.requestKind === "identity_recovery";

  return (
    <div className="portal-admin-detail-stack">
      <div className="portal-panel-header">
        <div>
          <p className="section-tag">Request detail</p>
          <h2>{detail.email}</h2>
        </div>
        <span className={`portal-state-badge portal-admin-status-${detail.status}`}>
          {formatRequestStatusLabel(detail.status)}
        </span>
      </div>

      <div className="portal-admin-summary-grid">
        <MetricCard label="Request kind" value={formatRequestKind(detail.requestKind)} />
        <MetricCard label="Submitted" value={formatDateTime(detail.createdAt)} />
        <MetricCard
          label="Reviewer"
          value={detail.reviewer?.label ?? "Awaiting review"}
        />
        <MetricCard
          label="Effective role"
          value={
            detail.requestKind === "identity_recovery"
              ? detail.recovery?.preserveExistingRole ?? "preserve existing role"
              : detail.requestedRole
          }
        />
      </div>

      <article className="portal-admin-card">
        <p className="section-tag">Evidence</p>
        <h3>Request rationale</h3>
        <p>{detail.rationale ?? "No rationale was supplied with this request."}</p>
        {detail.decisionNote ? (
          <>
            <h3>Decision note</h3>
            <p>{detail.decisionNote}</p>
          </>
        ) : null}
      </article>

      <div className="portal-admin-detail-columns">
        <article className="portal-admin-card">
          <p className="section-tag">Matched user</p>
          <h3>
            {detail.matchedUser
              ? detail.matchedUser.displayName ?? detail.matchedUser.email
              : "No matched user"}
          </h3>
          <p>
            {detail.matchedUser
              ? detail.matchedUser.email
              : "Approval stays blocked until the backend resolves the target user record."}
          </p>
          <div className="portal-filter-chip-row">
            {detail.matchedUserPosture ? (
              <>
                <span className="role-chip role-chip-muted">
                  {formatAccessPostureLabel(detail.matchedUserPosture.accessPosture)}
                </span>
                {detail.matchedUserPosture.activeRole ? (
                  <span className="role-chip role-chip-muted">
                    {detail.matchedUserPosture.activeRole.role}
                  </span>
                ) : null}
                <span className="role-chip role-chip-muted">
                  {detail.matchedUserPosture.linkedIdentityCount} linked identities
                </span>
              </>
            ) : (
              <span className="role-chip role-chip-muted">Pending user match</span>
            )}
          </div>
          <p className="portal-panel-muted">
            Existing-user inspection stays on the sibling `/admin/users` workspace.
          </p>
        </article>

        <article className="portal-admin-card">
          <p className="section-tag">Identity posture</p>
          <h3>Linked sign-in methods</h3>
          {detail.linkedIdentities.length === 0 ? (
            <p>No linked identities are attached to the matched user yet.</p>
          ) : (
            <div className="portal-admin-simple-list">
              {detail.linkedIdentities.map((identity) => (
                <div className="portal-admin-list-row" key={identity.id}>
                  <div>
                    <strong>{formatIdentityProviderLabel(identity.provider)}</strong>
                    <p>{identity.providerEmail ?? identity.providerSubject}</p>
                  </div>
                  <span className="role-chip role-chip-muted">
                    Seen {formatDateTime(identity.lastSeenAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {detail.recovery ? <RecoveryContextCard detail={detail} /> : null}
        </article>
      </div>

      <div className="portal-admin-detail-columns">
        <article className="portal-admin-card">
          <p className="section-tag">Related requests</p>
          <h3>Recent history stays visible for audit follow-up.</h3>
          <div className="portal-admin-simple-list">
            {detail.relatedRequests.map((item) => (
              <div className="portal-admin-list-row" key={item.id}>
                <div>
                  <strong>{formatRequestKind(item.requestKind)}</strong>
                  <p>{formatDateTime(item.createdAt)}</p>
                </div>
                <span className={`portal-state-badge portal-admin-status-${item.status}`}>
                  {formatRequestStatusLabel(item.status)}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="portal-admin-card">
          <p className="section-tag">Audit echoes</p>
          <h3>Privileged actions are visible close to the request.</h3>
          <div className="portal-admin-simple-list">
            {detail.auditEchoes.map((auditEvent) => (
              <div className="portal-admin-list-row" key={auditEvent.id}>
                <div>
                  <strong>{auditEvent.eventId}</strong>
                  <p>{auditEvent.actor?.label ?? "System actor"}</p>
                </div>
                <span className="role-chip role-chip-muted">
                  {formatDateTime(auditEvent.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="portal-admin-card" ref={actionSectionRef}>
        <p className="section-tag">Decision action</p>
        <h3>Admin actions stay request-scoped.</h3>
        <div className="auth-form">
          {!isRecoveryRequest ? (
            <label className="auth-field">
              <span>Approve as</span>
              <select
                disabled={!isPending || isMutating}
                onChange={(event) => {
                  const value = event.currentTarget.value as PortalAdminApprovedRole;
                  onChangeDraft({
                    ...draft,
                    approvedRole: value
                  });
                }}
                value={draft.approvedRole}
              >
                <option value="helper">Helper</option>
                <option value="collaborator">Collaborator</option>
              </select>
            </label>
          ) : null}
          <label className="auth-field">
            <span>{isRecoveryRequest ? "Decision note" : "Decision note"}</span>
            <textarea
              disabled={!isPending || isMutating}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onChangeDraft({
                  ...draft,
                  decisionNote: value
                });
              }}
              rows={4}
              value={draft.decisionNote}
            />
          </label>
        </div>
        <div className="portal-request-actions">
          <button
            className="button"
            disabled={!isPending || isMutating}
            onClick={onApprove}
            type="button"
          >
            {isMutating
              ? "Saving..."
              : isRecoveryRequest
                ? "Approve and link identity"
                : "Approve request"}
          </button>
          <button
            className="button button-secondary"
            disabled={!isPending || isMutating}
            onClick={onReject}
            type="button"
          >
            Reject with note
          </button>
        </div>
      </article>
    </div>
  );
}

function RecoveryContextCard({ detail }: { detail: PortalAdminAccessRequestDetail }) {
  if (!detail.recovery) {
    return null;
  }

  return (
    <div className="portal-admin-alert-block">
      <strong>Recovery-specific context</strong>
      <div className="portal-filter-chip-row">
        {detail.recovery.requestedIdentityProvider ? (
          <span className="role-chip role-chip-muted">
            {formatIdentityProviderLabel(detail.recovery.requestedIdentityProvider)}
          </span>
        ) : null}
        {detail.recovery.preserveExistingRole ? (
          <span className="role-chip role-chip-muted">
            Preserve {detail.recovery.preserveExistingRole}
          </span>
        ) : null}
        <span className="role-chip role-chip-muted">
          {detail.recovery.requestedIdentityAlreadyLinked
            ? "Identity already linked"
            : "Identity not linked yet"}
        </span>
      </div>
      <p>
        {detail.recovery.conflictingUser
          ? `Conflict: the requested identity is already attached to ${detail.recovery.conflictingUser.email}.`
          : "No conflicting identity owner is currently blocking recovery approval."}
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="portal-admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatRequestKind(requestKind: PortalAdminAccessRequestListItem["requestKind"]) {
  return requestKind === "identity_recovery" ? "Identity recovery" : "Access request";
}

function formatAccessPostureLabel(
  posture: NonNullable<PortalAdminAccessRequestListItem["matchedUserPosture"]>["accessPosture"]
) {
  if (posture === "approved") {
    return "Approved";
  }

  if (posture === "pending_request") {
    return "Pending request";
  }

  if (posture === "review_history_only") {
    return "Review history only";
  }

  return "No active role";
}

function formatIdentityProviderLabel(provider: PortalIdentityProvider) {
  if (provider === "cloudflare_github") {
    return "GitHub";
  }

  if (provider === "cloudflare_google") {
    return "Google";
  }

  return "One-time pin";
}

function formatRequestStatusLabel(status: PortalAdminAccessRequestListItem["status"]) {
  if (status === "approved") {
    return "Approved";
  }

  if (status === "rejected") {
    return "Rejected";
  }

  if (status === "withdrawn") {
    return "Withdrawn";
  }

  return "Pending";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString();
}

function buildMutationMessage(result: AdminMutationResult) {
  if (result.ok) {
    return "";
  }

  return result.conflictUserId
    ? `${result.message} Conflict owner: ${result.conflictUserId}.`
    : result.message;
}
