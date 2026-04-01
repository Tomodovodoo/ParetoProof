import { describe, expect, it } from "bun:test";
import {
  apiCallBoundaryCatalog,
  apiEndpointCatalog
} from "../dist/index.js";

describe("shared api catalog parity", () => {
  it("keeps endpoint ids and boundary ids in lockstep", () => {
    const endpointIds = apiEndpointCatalog.map((entry) => entry.id);
    const boundaryIds = apiCallBoundaryCatalog.map((entry) => entry.endpointId);

    expect(new Set(endpointIds).size).toBe(endpointIds.length);
    expect(new Set(boundaryIds).size).toBe(boundaryIds.length);

    expect(boundaryIds.slice().sort()).toEqual(endpointIds.slice().sort());
  });

  it("covers the admin offline-ingest mutation boundary explicitly", () => {
    expect(apiCallBoundaryCatalog).toContainEqual(
      expect.objectContaining({
        credential: "cloudflare_access_jwt",
        endpointId: "admin.problem9-offline-ingest.create",
        mode: "browser_direct",
        origin: "portal_browser"
      })
    );
  });
});
