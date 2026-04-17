import {
  portalOverviewResponseSchema,
  type PortalOverviewResponse
} from "@paretoproof/shared";
import { getApiBaseUrl } from "./api-base-url";
import { fetchApi } from "./api-fetch";

export async function fetchPortalOverview(): Promise<PortalOverviewResponse> {
  const response = await fetchApi(`${getApiBaseUrl()}/portal/overview`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}.`);
  }

  return portalOverviewResponseSchema.parse(await response.json());
}
