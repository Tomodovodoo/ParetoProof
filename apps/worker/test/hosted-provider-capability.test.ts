import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProblem9HostedCapability,
  getProblem9HostedCapabilityViolation
} from "@paretoproof/shared";

test("hosted provider capability rejects unsupported hosted auth modes", () => {
  const violation = getProblem9HostedCapabilityViolation({
    authMode: "local_stub",
    modelConfigId: "local_stub/problem9_fixture.v1",
    providerFamily: "openai"
  });

  assert.equal(violation?.code, "unsupported_hosted_auth_mode");
  assert.match(violation?.message ?? "", /Unsupported hosted auth mode local_stub/);
});

test("hosted provider capability rejects unsupported hosted provider families", () => {
  const violation = getProblem9HostedCapabilityViolation({
    authMode: "machine_api_key",
    modelConfigId: "anthropic/claude-opus",
    providerFamily: "anthropic"
  });

  assert.equal(violation?.code, "unsupported_hosted_provider_family");
  assert.match(violation?.message ?? "", /Unsupported hosted provider family anthropic/);
});

test("hosted provider capability accepts the current hosted allowlist", () => {
  assert.doesNotThrow(() =>
    assertProblem9HostedCapability({
      authMode: "machine_api_key",
      modelConfigId: "openai/gpt-5",
      providerFamily: "openai"
    })
  );
});
