import { describe, expect, it } from "bun:test";
import {
  buildMathLaunchExportDataUrl,
  buildMathQuestionLaunchBootstrapResponse,
  buildMathQuestionLaunchRequest,
  defaultMathQuestion,
  mathLaunchPresets,
  resolveMathQuestionFromPath
} from "./math-launch";

const preset = mathLaunchPresets[0];

describe("math launch helpers", () => {
  it("builds hosted question launch payloads with platform-managed credential posture", () => {
    const request = buildMathQuestionLaunchRequest({
      mode: "hosted",
      preset,
      question: defaultMathQuestion
    });

    expect(request.mode).toBe("hosted");
    expect(request.credentialPolicy).toBe("platform_managed");
    expect(request.modelConfigId).toBe("openai/problem9-single-pass");
    expect(request.harness.authMode).toBe("machine_api_key");
    expect(request.harness.runtimeClass).toBe("hosted_worker");
    expect(JSON.stringify(request).toLowerCase()).not.toContain("secret");
  });

  it("builds local connected bootstrap metadata without carrying provider secrets", () => {
    const request = buildMathQuestionLaunchRequest({
      mode: "local_connected",
      preset,
      question: defaultMathQuestion
    });
    const response = buildMathQuestionLaunchBootstrapResponse(request, "2026-05-09T00:00:00.000Z");

    expect(response.mode).toBe("local_connected");
    expect(request.modelConfigId).toBe("openai/problem9-single-pass");
    expect(response.bootstrap.authBoundary).toBe("runner_host_only");
    expect(response.bootstrap.manifest.modelConfigId).toBe("openai/problem9-single-pass");
    expect(response.bootstrap.rawProviderSecretAccepted).toBeFalse();
    expect(response.bootstrap.runnerCommand.command).toContain("--preflight-only");
  });

  it("builds an offline export data URL with a descriptor that excludes provider secrets", () => {
    const request = buildMathQuestionLaunchRequest({
      mode: "offline_export",
      preset,
      question: defaultMathQuestion
    });
    const response = buildMathQuestionLaunchBootstrapResponse(request, "2026-05-09T00:00:00.000Z");
    const href = buildMathLaunchExportDataUrl(response);

    expect(href).toStartWith("data:application/json;charset=utf-8,");

    const [, encodedPayload] = href.split(",", 2);
    const descriptor = JSON.parse(decodeURIComponent(encodedPayload));

    expect(descriptor.includesProviderSecrets).toBeFalse();
    expect(descriptor.modelConfigId).toBe("openai/problem9-single-pass");
    expect(descriptor.harness.providerFamily).toBe("openai");
    expect(descriptor.runKind).toBe("single_run");
    expect(descriptor.question.questionId).toBe("firstproof/Problem9");
    expect(descriptor.files).toContain("benchmarks/firstproof/problem9/benchmark-package.json");
  });

  it("resolves encoded question routes back to the canonical Problem 9 descriptor", () => {
    expect(resolveMathQuestionFromPath("/questions/firstproof%2FProblem9")).toMatchObject({
      benchmarkItemId: "Problem9",
      questionId: "firstproof/Problem9"
    });
  });
});
