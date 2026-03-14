import type { PortalAdminUserDetail, PortalAdminUserListItem } from "@paretoproof/shared";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import { getApiBaseUrl } from "../lib/api-base-url";
import {
  loadPortalAdminUserDetail,
  loadPortalAdminUsers,
  revokePortalAdminUserRole,
  summarizeUserPosture
} from "../lib/portal-admin";
import { usePortalPolling } from "../lib/portal-freshness";
import { useCompactLayout } from "../lib/use-compact-layout";

type PortalAdminUsersPanelProps = {
  email: string | null;
};

type UserFilters = {
  accessPosture: "all" | PortalAdminUserListItem["accessPosture"];
  activeRole: "all" | "helper" | "collaborator";
  identityProvider: "all" | "cloudflare_github" | "cloudflare_google";
  search: string;
};

type ActionFeedback = {
  message: string;
  tone: "error" | "success";
};

const initialFilters: UserFilters = {
  accessPosture: "all",
  activeRole: "all",
  identityProvider: "all",
  search: ""
};

export function resolveSelectedAdminUserId(
  selectedUserId: string | null,
  visibleUsers: PortalAdminUserListItem[]
) {
  if (selectedUserId && visibleUsers.some((user) => user.userId === selectedUserId)) {
    return selectedUserId;
  }

  return visibleUsers[0]?.userId ?? null;
}

export function getCompactAdminUsersSectionOrder() {
  return ["userList", "filterFields"] as const;
}

export function hasCurrentAdminUserDetail(
  selectedUserId: string | null,
  detailItem: PortalAdminUserDetail | null
) {
  return Boolean(selectedUserId && detailItem?.userId === selectedUserId);
}

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "None";
  }

  return new Date(timestamp).toLocaleString();
}

function filterUsers(items: PortalAdminUserListItem[], filters: UserFilters) {
  const query = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.activeRole !== "all" && item.activeRole?.role !== filters.activeRole) {
      return false;
    }

    if (filters.accessPosture !== "all" && item.accessPosture !== filters.accessPosture) {
      return false;
    }

    if (
      filters.identityProvider !== "all" &&
      !item.linkedIdentityProviders.includes(filters.identityProvider)
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      item.email.toLowerCase().includes(query) ||
      item.userId.toLowerCase().includes(query) ||
      (item.displayName ?? "").toLowerCase().includes(query)
    );
  });
}

export function PortalAdminUsersPanel({ email }: PortalAdminUsersPanelProps) {
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<Awaited<
    ReturnType<typeof loadPortalAdminUserDetail>
  > | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [filters, setFilters] = useState<UserFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [revocationReason, setRevocationReason] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<PortalAdminUserListItem[]>([]);
  const detailRequestIdRef = useRef(0);
  const detailShellRef = useRef<HTMLElement | null>(null);
  const correctiveActionRef = useRef<HTMLElement | null>(null);
  const pendingCompactRevealUserIdRef = useRef<string | null>(null);
  const selectedUserIdRef = useRef<string | null>(null);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const isCompactLayout = useCompactLayout();
  const {
    isPolling,
    lastUpdatedAt,
    markUpdated
  } = usePortalPolling({
    enabled: !isLoading && !isMutating,
    onPoll: async () => {
      await refreshUsers();
    },
    routeId: "portal.admin.users"
  });
  const visibleUsers = useMemo(() => filterUsers(users, filters), [filters, users]);
  const hasSelectedDetail = hasCurrentAdminUserDetail(selectedUserId, detailItem);

  selectedUserIdRef.current = selectedUserId;

  useEffect(() => {
    void refreshUsers(true);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!selectedUserId) {
      detailRequestIdRef.current += 1;
      setDetailItem(null);
      setDetailError(null);
      setIsDetailLoading(false);
      setActionFeedback(null);
      return;
    }

    setActionFeedback(null);
    void loadSelectedUserDetail(selectedUserId, true);
  }, [apiBaseUrl, selectedUserId]);

  async function loadSelectedUserDetail(userId: string, clearCurrentDetail = false) {
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setDetailError(null);
    setRevocationReason("");
    setIsDetailLoading(true);

    if (clearCurrentDetail) {
      setDetailItem(null);
    }

    try {
      const nextDetail = await loadPortalAdminUserDetail(apiBaseUrl, userId);

      if (detailRequestIdRef.current !== requestId || selectedUserIdRef.current !== userId) {
        return false;
      }

      setDetailItem(nextDetail);
      return true;
    } catch (error) {
      if (detailRequestIdRef.current !== requestId || selectedUserIdRef.current !== userId) {
        return false;
      }

      setDetailItem(null);
      setDetailError(
        error instanceof Error ? error.message : "The user detail could not be loaded."
      );
      return false;
    } finally {
      if (detailRequestIdRef.current === requestId && selectedUserIdRef.current === userId) {
        setIsDetailLoading(false);
      }
    }
  }

  useEffect(() => {
    if (
      !isCompactLayout ||
      !selectedUserId ||
      pendingCompactRevealUserIdRef.current !== selectedUserId
    ) {
      return;
    }

    const detailShell = correctiveActionRef.current ?? detailShellRef.current;

    if (!detailShell) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      detailShell.scrollIntoView({
        behavior: "auto",
        block: "start"
      });
      pendingCompactRevealUserIdRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isCompactLayout, selectedUserId]);

  async function refreshUsers(initialLoad = false) {
    try {
      const nextItems = await loadPortalAdminUsers(apiBaseUrl);
      const nextVisibleUsers = filterUsers(nextItems, filters);
      const nextSelectedUserId = resolveSelectedAdminUserId(
        selectedUserIdRef.current,
        nextVisibleUsers
      );

      setUsers(nextItems);
      setListError(null);
      markUpdated();

      if (nextSelectedUserId !== selectedUserIdRef.current) {
        setSelectedUserId(nextSelectedUserId);
        return true;
      }

      if (nextSelectedUserId) {
        return await loadSelectedUserDetail(nextSelectedUserId);
      }

      detailRequestIdRef.current += 1;
      setDetailItem(null);
      setDetailError(null);
      setIsDetailLoading(false);
      return true;
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "The admin user directory could not be loaded."
      );
      return false;
    } finally {
      if (initialLoad) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    const nextSelectedUserId = resolveSelectedAdminUserId(selectedUserId, visibleUsers);

    if (nextSelectedUserId === selectedUserId) {
      return;
    }

    setSelectedUserId(nextSelectedUserId);
  }, [selectedUserId, visibleUsers]);

  async function handleRevoke() {
    if (!detailItem || isMutating) {
      return;
    }

    try {
      setActionFeedback(null);
      setIsMutating(true);
      const result = await revokePortalAdminUserRole(apiBaseUrl, detailItem.userId, {
        reason: revocationReason
      });

      if (!result.ok) {
        setActionFeedback({
          message: result.message,
          tone: "error"
        });
        return;
      }

      const refreshSucceeded = await refreshUsers();

      if (!refreshSucceeded) {
        setActionFeedback({
          message: "The role was revoked, but the refreshed user data could not be loaded.",
          tone: "error"
        });
        return;
      }

      setActionFeedback({
        message: "Active contributor role revoked and current sessions cleared.",
        tone: "success"
      });
    } catch (error) {
      setActionFeedback({
        message:
          error instanceof Error
            ? error.message
            : "The role revocation could not be completed.",
        tone: "error"
      });
    } finally {
      setIsMutating(false);
    }
  }

  function revealSelectedUserDetail(userId: string) {
    if (isCompactLayout && userId === selectedUserId) {
      (correctiveActionRef.current ?? detailShellRef.current)?.scrollIntoView({
        behavior: "auto",
        block: "start"
      });
      return;
    }

    pendingCompactRevealUserIdRef.current = userId;
    setSelectedUserId(userId);
  }

  if (isLoading) {
    return (
      <section className="portal-grid portal-grid-stack">
        <article className="portal-panel">
          <p className="section-tag">Admin users</p>
          <h2>Loading contributor user management</h2>
          <p>Fetching the current account directory and review history.</p>
        </article>
      </section>
    );
  }

  const introPanel = (
    <article className="portal-panel">
      <p className="section-tag">Admin users</p>
      <h2>Inspect approved accounts and apply corrective access changes.</h2>
      <p>
        Signed in{email ? ` as ${email}` : ""}. This route is user-owned: inspect account
        posture, request history, identity links, and the single MVP corrective action to revoke
        an active contributor role.
      </p>
      <PortalFreshnessCard
        isRefreshing={isPolling || isMutating}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => {
          void refreshUsers().catch(() => {
            // refreshUsers already exposes the visible error state.
          });
        }}
        routeId="portal.admin.users"
      />
      {listError ? (
        <p className="portal-admin-feedback portal-admin-feedback-error">{listError}</p>
      ) : null}
    </article>
  );

  const filterFields = (
    <div className="portal-admin-filter-grid">
      <label className="auth-field">
        <span>Search</span>
        <input
          onChange={(event) => {
            const value = event.currentTarget.value;
            setFilters((current) => ({
              ...current,
              search: value
            }));
          }}
          placeholder="Email, display name, or user id"
          type="search"
          value={filters.search}
        />
      </label>

      <label className="auth-field">
        <span>Access posture</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as UserFilters["accessPosture"];
            setFilters((current) => ({
              ...current,
              accessPosture: value
            }));
          }}
          value={filters.accessPosture}
        >
          <option value="all">All postures</option>
          <option value="approved">Approved</option>
          <option value="pending_request">Pending request</option>
          <option value="review_history_only">Review history only</option>
          <option value="no_active_role">No active role</option>
        </select>
      </label>

      <label className="auth-field">
        <span>Active role</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as UserFilters["activeRole"];
            setFilters((current) => ({
              ...current,
              activeRole: value
            }));
          }}
          value={filters.activeRole}
        >
          <option value="all">All roles</option>
          <option value="helper">Helper</option>
          <option value="collaborator">Collaborator</option>
        </select>
      </label>

      <label className="auth-field">
        <span>Identity provider</span>
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as UserFilters["identityProvider"];
            setFilters((current) => ({
              ...current,
              identityProvider: value
            }));
          }}
          value={filters.identityProvider}
        >
          <option value="all">Any provider</option>
          <option value="cloudflare_github">GitHub</option>
          <option value="cloudflare_google">Google</option>
        </select>
      </label>
    </div>
  );

  const userList =
    visibleUsers.length === 0 ? (
      <article className="portal-admin-card portal-admin-card-empty">
        <h3>No users match this slice.</h3>
        <p>Adjust the directory filters to bring the relevant contributor accounts back in.</p>
      </article>
    ) : (
      <div className="portal-admin-list">
        {visibleUsers.map((item) => {
          const isActive = item.userId === selectedUserId;

          return (
            <button
              className={`portal-admin-card portal-admin-list-card${
                isActive ? " portal-admin-list-card-active" : ""
              }`}
              key={item.userId}
              onClick={() => {
                revealSelectedUserDetail(item.userId);
                setActionFeedback(null);
              }}
              type="button"
            >
              <div className="portal-admin-row">
                <div>
                  <p className="portal-action-title">
                    {item.displayName ?? item.email}
                  </p>
                  <p className="portal-action-copy">{summarizeUserPosture(item)}</p>
                </div>
                <span className="role-chip role-chip-tonal">
                  {item.activeRole?.role ?? item.accessPosture}
                </span>
              </div>
              <p className="portal-admin-meta">{item.email}</p>
              <div className="portal-admin-chip-row">
                {item.linkedIdentityProviders.length === 0 ? (
                  <span className="role-chip role-chip-muted">No linked identities</span>
                ) : (
                  item.linkedIdentityProviders.map((provider) => (
                    <span className="role-chip role-chip-muted" key={provider}>
                      {provider}
                    </span>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>
    );

  const layout = (
    <section className="portal-admin-layout">
      <aside className="portal-admin-list-shell">
        {isCompactLayout
          ? getCompactAdminUsersSectionOrder().map((sectionId) => {
              const sections = {
                filterFields,
                userList
              };

              return <Fragment key={sectionId}>{sections[sectionId]}</Fragment>;
            })
          : (
              <>
                {userList}
                {filterFields}
              </>
            )}
      </aside>

      <section className="portal-admin-detail-shell" ref={detailShellRef}>
        {selectedUserId && (isDetailLoading || !hasSelectedDetail) ? (
          <article className="portal-admin-card portal-admin-card-empty">
            <h3>Loading user detail</h3>
            <p>Fetching account posture, linked identities, and recent admin activity.</p>
          </article>
        ) : detailError ? (
          <article className="portal-admin-card portal-admin-card-empty">
            <h3>User detail unavailable</h3>
            <p>{detailError}</p>
          </article>
        ) : detailItem ? (
          <>
            <article className="portal-admin-card">
              <div className="portal-admin-row">
                <div>
                  <p className="section-tag">User detail</p>
                  <h3>{detailItem.displayName ?? detailItem.email}</h3>
                </div>
                <span className="role-chip role-chip-tonal">
                  {detailItem.activeRole?.role ?? detailItem.accessPosture}
                </span>
              </div>
              <p className="portal-admin-meta">
                {detailItem.email} - user id {detailItem.userId}
              </p>
              <div className="portal-admin-chip-row">
                <span className="role-chip role-chip-muted">
                  Active sessions {detailItem.sessionPosture.activeSessionCount}
                </span>
                <span className="role-chip role-chip-muted">
                  Latest session expiry {formatTimestamp(detailItem.sessionPosture.latestSessionExpiresAt)}
                </span>
              </div>
              {actionFeedback ? (
                <p
                  className={`portal-admin-feedback portal-admin-feedback-${actionFeedback.tone}`}
                >
                  {actionFeedback.message}
                </p>
              ) : null}
            </article>

            <div className="portal-admin-two-column">
              <article className="portal-admin-card">
                <p className="section-tag">Linked identities</p>
                <h3>Who can authenticate as this user</h3>
                <div className="portal-admin-stack">
                  {detailItem.linkedIdentities.map((identity) => (
                    <article className="portal-admin-mini-card" key={identity.id}>
                      <strong>{identity.provider}</strong>
                      <p>{identity.providerEmail ?? identity.providerSubject}</p>
                      <small>Last seen {formatTimestamp(identity.lastSeenAt)}</small>
                    </article>
                  ))}
                </div>
              </article>

              <article className="portal-admin-card">
                <p className="section-tag">Role history</p>
                <h3>Grant and revocation posture</h3>
                <div className="portal-admin-stack">
                  {detailItem.roleGrantHistory.length === 0 ? (
                    <p className="portal-action-copy">No role history has been recorded yet.</p>
                  ) : (
                    detailItem.roleGrantHistory.map((roleGrant) => (
                      <article
                        className="portal-admin-mini-card"
                        key={`${roleGrant.role}-${roleGrant.grantedAt}`}
                      >
                        <strong>{roleGrant.role}</strong>
                        <p>Granted {formatTimestamp(roleGrant.grantedAt)}</p>
                        <small>
                          {roleGrant.revokedAt
                            ? `Revoked ${formatTimestamp(roleGrant.revokedAt)}`
                            : "Still active"}
                        </small>
                      </article>
                    ))
                  )}
                </div>
              </article>
            </div>

            <article className="portal-admin-card" ref={correctiveActionRef}>
              <p className="section-tag">Corrective action</p>
              <h3>Revoke the current contributor role from this user.</h3>
              <p className="portal-action-copy">
                This is the only MVP corrective action on the users route. It removes the active
                helper or collaborator role and clears current sessions so the next sign-in
                resolves the new posture cleanly.
              </p>
              <div className="auth-form">
                <label className="auth-field">
                  <span>Visible revocation reason</span>
                  <textarea
                    disabled={!detailItem.activeRole || isMutating}
                    onChange={(event) => {
                      setRevocationReason(event.currentTarget.value);
                    }}
                    rows={4}
                    value={revocationReason}
                  />
                </label>
              </div>
              <div className="portal-request-actions">
                <button
                  className="button"
                  disabled={!detailItem.activeRole || isMutating}
                  onClick={() => {
                    void handleRevoke();
                  }}
                  type="button"
                >
                  {isMutating ? "Revoking..." : "Revoke active role"}
                </button>
              </div>
            </article>

            <div className="portal-admin-two-column">
              <article className="portal-admin-card">
                <p className="section-tag">Request history</p>
                <h3>How this posture was reached</h3>
                <div className="portal-admin-stack">
                  {detailItem.requestHistory.length === 0 ? (
                    <p className="portal-action-copy">
                      No request history is attached to this user yet.
                    </p>
                  ) : (
                    detailItem.requestHistory.map((requestItem) => (
                      <article className="portal-admin-mini-card" key={requestItem.id}>
                        <strong>
                          {requestItem.requestKind === "identity_recovery"
                            ? "Identity recovery"
                            : "Access request"}
                        </strong>
                        <p>{requestItem.decisionNote ?? requestItem.rationale ?? "No note recorded."}</p>
                        <small>{formatTimestamp(requestItem.reviewedAt ?? requestItem.createdAt)}</small>
                      </article>
                    ))
                  )}
                </div>
              </article>

              <article className="portal-admin-card">
                <p className="section-tag">Audit history</p>
                <h3>Recent privileged events for this user</h3>
                <div className="portal-admin-stack">
                  {detailItem.auditHistory.map((entry) => (
                    <article className="portal-admin-mini-card" key={entry.id}>
                      <strong>{entry.eventId}</strong>
                      <p>{entry.actor?.label ?? "System context"} - {entry.severity}</p>
                      <small>{formatTimestamp(entry.createdAt)}</small>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          </>
        ) : (
          <article className="portal-admin-card portal-admin-card-empty">
            <h3>Select a user</h3>
            <p>Choose a user row to inspect account posture, history, and corrective actions.</p>
          </article>
        )}
      </section>
    </section>
  );

  return (
    <section className="portal-grid portal-grid-stack portal-grid-admin-workspace">
      {isCompactLayout ? layout : introPanel}
      {isCompactLayout ? introPanel : layout}
    </section>
  );
}
