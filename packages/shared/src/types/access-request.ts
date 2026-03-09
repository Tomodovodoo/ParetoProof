export type PortalAccessRequestRole = "admin" | "collaborator" | "helper";
export type PortalSelfServiceAccessRequestRole = "collaborator" | "helper";

export type PortalAccessRequestInput = {
  rationale: string | null;
  requestedRole: PortalSelfServiceAccessRequestRole;
};

export type PortalAccessRequestStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "withdrawn";

export type PortalAccessRequestSummary = {
  createdAt: string;
  decisionNote: string | null;
  email: string;
  id: string;
  rationale: string | null;
  requestedRole: PortalAccessRequestRole;
  reviewedAt: string | null;
  status: PortalAccessRequestStatus;
};
