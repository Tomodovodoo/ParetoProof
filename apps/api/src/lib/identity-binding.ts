import type { PortalIdentityProvider } from "@paretoproof/shared";
import { and, eq } from "drizzle-orm";
import { accessRequests, userIdentities } from "../db/schema.js";

type UserIdentityLike = Pick<
  typeof userIdentities.$inferSelect,
  "provider" | "providerSubject"
>;
type AccessRequestIdentityLike = Pick<
  typeof accessRequests.$inferSelect,
  "requestedIdentityProvider" | "requestedIdentitySubject"
>;

export function buildUserIdentityProviderSubjectMatch(
  provider: PortalIdentityProvider,
  subject: string
) {
  return and(
    eq(userIdentities.provider, provider),
    eq(userIdentities.providerSubject, subject)
  );
}

export function matchesUserIdentityProviderSubject(
  identityRow: UserIdentityLike,
  provider: PortalIdentityProvider,
  subject: string
) {
  return (
    identityRow.provider === provider &&
    identityRow.providerSubject === subject
  );
}

export function filterUserIdentityProviderSubjectMatch<T extends UserIdentityLike>(
  identityRow: T | null | undefined,
  provider: PortalIdentityProvider,
  subject: string
) {
  return identityRow &&
    matchesUserIdentityProviderSubject(identityRow, provider, subject)
    ? identityRow
    : null;
}

export function buildRequestedIdentityProviderSubjectMatch(
  provider: PortalIdentityProvider,
  subject: string
) {
  return and(
    eq(accessRequests.requestedIdentityProvider, provider),
    eq(accessRequests.requestedIdentitySubject, subject)
  );
}

export function matchesRequestedIdentityProviderSubject(
  requestRow: AccessRequestIdentityLike,
  provider: PortalIdentityProvider,
  subject: string
) {
  return (
    requestRow.requestedIdentityProvider === provider &&
    requestRow.requestedIdentitySubject === subject
  );
}

export function filterRequestedIdentityProviderSubjectMatch<
  T extends AccessRequestIdentityLike
>(requestRow: T | null | undefined, provider: PortalIdentityProvider, subject: string) {
  return requestRow &&
    matchesRequestedIdentityProviderSubject(requestRow, provider, subject)
    ? requestRow
    : null;
}
