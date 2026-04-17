import type { PortalRole } from "@paretoproof/shared";
import type { AuthenticatedSurface } from "./surface";

export type ApprovedAuthHandoff = {
  role: PortalRole | null;
  status: "approved";
  surface: AuthenticatedSurface;
};

type ApprovedAuthHandoffRecord = ApprovedAuthHandoff & {
  savedAtMs: number;
  version: 1;
};

type LocationLike = Pick<Location, "hostname" | "protocol">;

type CookieDocumentLike = {
  cookie: string;
};

const approvedAuthHandoffCookieName = "paretoproof_approved_auth_handoff";
const approvedAuthHandoffTtlMs = 30_000;

function encodeApprovedAuthHandoff(
  handoff: ApprovedAuthHandoff,
  savedAtMs: number
) {
  const record: ApprovedAuthHandoffRecord = {
    ...handoff,
    savedAtMs,
    version: 1
  };

  return encodeURIComponent(JSON.stringify(record));
}

function decodeApprovedAuthHandoff(
  rawValue: string
): ApprovedAuthHandoffRecord | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<ApprovedAuthHandoffRecord>;

    if (
      parsed.version !== 1 ||
      parsed.status !== "approved" ||
      (parsed.surface !== "portal" && parsed.surface !== "math") ||
      (parsed.role !== null &&
        parsed.role !== "admin" &&
        parsed.role !== "collaborator" &&
        parsed.role !== "helper") ||
      typeof parsed.savedAtMs !== "number"
    ) {
      return null;
    }

    return parsed as ApprovedAuthHandoffRecord;
  } catch {
    return null;
  }
}

function readCookieValue(cookieHeader: string, name: string) {
  for (const segment of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = segment.trim().split("=");

    if (cookieName === name) {
      return valueParts.join("=");
    }
  }

  return null;
}

function resolveCookieDomain(locationLike: LocationLike) {
  return locationLike.hostname.endsWith(".paretoproof.com") ||
    locationLike.hostname === "paretoproof.com"
    ? ".paretoproof.com"
    : null;
}

export function buildApprovedAuthHandoffCookieValue(
  handoff: ApprovedAuthHandoff,
  savedAtMs = Date.now()
) {
  return `${approvedAuthHandoffCookieName}=${encodeApprovedAuthHandoff(
    handoff,
    savedAtMs
  )}`;
}

export function buildApprovedAuthHandoffCookieMutation(
  handoff: ApprovedAuthHandoff,
  locationLike: LocationLike = window.location,
  savedAtMs = Date.now()
) {
  const parts = [
    buildApprovedAuthHandoffCookieValue(handoff, savedAtMs),
    "Path=/",
    `Max-Age=${Math.ceil(approvedAuthHandoffTtlMs / 1000)}`,
    "SameSite=Lax"
  ];
  const cookieDomain = resolveCookieDomain(locationLike);

  if (cookieDomain) {
    parts.push(`Domain=${cookieDomain}`);
  }

  if (locationLike.protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearApprovedAuthHandoffCookieMutation(
  locationLike: LocationLike = window.location
) {
  const parts = [
    `${approvedAuthHandoffCookieName}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax"
  ];
  const cookieDomain = resolveCookieDomain(locationLike);

  if (cookieDomain) {
    parts.push(`Domain=${cookieDomain}`);
  }

  if (locationLike.protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function readApprovedAuthHandoffCookie(
  cookieHeader: string,
  options: {
    nowMs?: number;
    surface: AuthenticatedSurface;
  }
): ApprovedAuthHandoff | null {
  const rawValue = readCookieValue(cookieHeader, approvedAuthHandoffCookieName);

  if (!rawValue) {
    return null;
  }

  const record = decodeApprovedAuthHandoff(rawValue);

  if (!record || record.surface !== options.surface) {
    return null;
  }

  if ((options.nowMs ?? Date.now()) - record.savedAtMs > approvedAuthHandoffTtlMs) {
    return null;
  }

  return {
    role: record.role,
    status: "approved",
    surface: record.surface
  };
}

export function writeApprovedAuthHandoffCookie(
  handoff: ApprovedAuthHandoff,
  options?: {
    documentLike?: CookieDocumentLike;
    locationLike?: LocationLike;
    savedAtMs?: number;
  }
) {
  const documentLike = options?.documentLike ?? document;
  documentLike.cookie = buildApprovedAuthHandoffCookieMutation(
    handoff,
    options?.locationLike ?? window.location,
    options?.savedAtMs
  );
}

export function clearApprovedAuthHandoffCookie(options?: {
  documentLike?: CookieDocumentLike;
  locationLike?: LocationLike;
}) {
  const documentLike = options?.documentLike ?? document;
  documentLike.cookie = buildClearApprovedAuthHandoffCookieMutation(
    options?.locationLike ?? window.location
  );
}

export function consumeApprovedAuthHandoffCookie(
  options: {
    documentLike?: CookieDocumentLike;
    locationLike?: LocationLike;
    nowMs?: number;
    surface: AuthenticatedSurface;
  }
) {
  const documentLike = options.documentLike ?? document;
  const handoff = readApprovedAuthHandoffCookie(documentLike.cookie, {
    nowMs: options.nowMs,
    surface: options.surface
  });

  clearApprovedAuthHandoffCookie({
    documentLike,
    locationLike: options.locationLike ?? window.location
  });

  return handoff;
}
