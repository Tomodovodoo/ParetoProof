import { describe, expect, it } from "bun:test";
import {
  mathLocalConnectedBootstrapResponseSchema,
  mathOfflineExportRequestSchema,
  mathQuestionLaunchRequestSchema
} from "./math-launch.js";

const question = {
  benchmarkFamily: "firstproof",
  benchmarkItemId: "Problem9",
  benchmarkPackageId: "firstproof/Problem9",
  benchmarkPackageVersion: "2026.03.15",
  benchmarkVersionId: "firstproof/Problem9@2026.03.15",
  laneId: "lean422_exact",
  questionId: "firstproof/Problem9"
};

describe("math question launch contracts", () => {
  it("accepts the hosted launch request shape without browser secrets", () => {
    const parsed = mathQuestionLaunchRequestSchema.safeParse({
      credentialPolicy: "platform_managed",
      harness: {
        authMode: "machine_api_key",
        harnessId: "problem9_hosted",
        harnessRevision: "problem9",
        imageDigest: null,
        providerFamily: "openai",
        runMode: "single_pass_probe",
        runtimeClass: "hosted_worker",
        toolProfile: "no_tools"
      },
      mode: "hosted",
      modelConfigId: "openai/problem9-single-pass",
      question,
      requestedSurface: "math",
      runKind: "single_run"
    });

    expect(parsed.success).toBeTrue();
  });

  it("rejects hidden provider secret fields on browser launch payloads", () => {
    const parsed = mathQuestionLaunchRequestSchema.safeParse({
      credentialPolicy: "runner_host_local",
      harness: {
        authMode: "trusted_local_user",
        harnessId: "problem9_trusted_local_devbox",
        harnessRevision: "problem9",
        imageDigest: null,
        providerFamily: "openai",
        providerApiKey: "sk-not-allowed",
        runMode: "single_pass_probe",
        runtimeClass: "trusted_local_devbox",
        toolProfile: "no_tools"
      },
      mode: "local_connected",
      modelConfigId: "openai/problem9-single-pass",
      question,
      requestedSurface: "math",
      runKind: "single_run"
    });

    expect(parsed.success).toBeFalse();
  });

  it("keeps offline export explicitly credential-free", () => {
    const parsed = mathOfflineExportRequestSchema.parse({
      credentialPolicy: "none",
      exportFormat: "problem9_offline_run_bundle_descriptor",
      harness: {
        authMode: "none",
        harnessId: "problem9_offline_export",
        harnessRevision: "problem9",
        imageDigest: null,
        providerFamily: "offline",
        runMode: "single_pass_probe",
        runtimeClass: "offline_export",
        toolProfile: "no_tools"
      },
      mode: "offline_export",
      modelConfigId: "openai/problem9-single-pass",
      question,
      requestedSurface: "math",
      runKind: "single_run"
    });

    expect(parsed.credentialPolicy).toBe("none");
    expect(parsed.exportFormat).toBe("problem9_offline_run_bundle_descriptor");
  });

  it("accepts local connected bootstrap responses with runner-host-only auth", () => {
    const parsed = mathLocalConnectedBootstrapResponseSchema.parse({
      bootstrap: {
        authBoundary: "runner_host_only",
        expiresAt: null,
        manifest: {
          harnessId: "problem9_trusted_local_devbox",
          modelConfigId: "openai/problem9-single-pass",
          questionId: "firstproof/Problem9",
          runKind: "single_run",
          tokenAudience: "paretoproof-local-runner",
          tokenScope: "math.question.launch.local"
        },
        rawProviderSecretAccepted: false,
        runnerCommand: {
          command: [
            "node",
            "infra/scripts/run-problem9-trusted-local-attempt.mjs",
            "--preflight-only"
          ],
          label: "Trusted-local preflight",
          workingDirectory: "repo root"
        }
      },
      mode: "local_connected",
      status: "bootstrap_ready"
    });

    expect(parsed.bootstrap.rawProviderSecretAccepted).toBeFalse();
    expect(parsed.bootstrap.manifest.modelConfigId).toBe("openai/problem9-single-pass");
    expect(parsed.bootstrap.manifest.tokenScope).toBe("math.question.launch.local");
  });
});
