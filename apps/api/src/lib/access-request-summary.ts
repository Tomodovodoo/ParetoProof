import type { PortalAccessRequestSummary } from "@paretoproof/shared";
import { accessRequests } from "../db/schema.js";

export function toAccessRequestSummary(
  requestRow: typeof accessRequests.$inferSelect
): PortalAccessRequestSummary {
  return {
    createdAt: requestRow.createdAt.toISOString(),
    decisionNote: requestRow.decisionNote,
    email: requestRow.email,
    id: requestRow.id,
    requestKind: requestRow.requestKind,
    rationale: requestRow.rationale,
    requestedRole: requestRow.requestedRole,
    reviewedAt: requestRow.reviewedAt?.toISOString() ?? null,
    status: requestRow.status
  };
}
