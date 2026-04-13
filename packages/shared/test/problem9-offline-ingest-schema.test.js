import { describe, expect, it } from "bun:test";
import { problem9EnvironmentManifestSchema } from "../dist/index.js";

function buildEnvironmentManifest(overrides = {}) {
  return {
    authMode: "machine_api_key",
    environmentSchemaVersion: "1",
    executionImageDigest: "7".repeat(64),
    executionTargetKind: "paretoproof-worker",
    harnessRevision: "worker-harness.v1",
    lakeSnapshotId: "leanprover/lean4:v4.22.0",
    laneId: "lean422_exact",
    leanVersion: "4.22.0",
    localDevboxDigest: null,
    metadata: {},
    modelConfigId: "openai/gpt-5",
    modelSnapshotId: "openai/gpt-5.2026-03-13",
    os: {
      arch: "x64",
      platform: "linux",
      release: "test-kernel"
    },
    promptProtocolVersion: "problem9-prompt-protocol.v1",
    providerFamily: "openai",
    runMode: "bounded_agentic_attempt",
    runtime: {
      bunVersion: null,
      nodeVersion: "v22.14.0",
      tsxVersion: null
    },
    toolProfile: "workspace_edit_limited",
    verifierVersion: "lean4.22.0",
    ...overrides
  };
}

describe("problem9 offline ingest environment schema", () => {
  it("accepts hosted worker provenance when the wrapper digest is present", () => {
    expect(problem9EnvironmentManifestSchema.parse(buildEnvironmentManifest())).toEqual(
      buildEnvironmentManifest()
    );
  });

  it("rejects hosted worker provenance without an execution image digest", () => {
    expect(
      problem9EnvironmentManifestSchema.safeParse(
        buildEnvironmentManifest({ executionImageDigest: null })
      ).success
    ).toBe(false);
  });

  it("rejects hosted worker provenance with a local devbox digest", () => {
    expect(
      problem9EnvironmentManifestSchema.safeParse(
        buildEnvironmentManifest({ localDevboxDigest: "8".repeat(64) })
      ).success
    ).toBe(false);
  });
});
