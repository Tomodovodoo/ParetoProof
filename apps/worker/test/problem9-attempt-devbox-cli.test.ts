import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrustedLocalDevboxDockerArgs
} from "../src/lib/problem9-attempt-devbox-cli.ts";
import {
  trustedLocalCodexContainerAuthJsonPath,
  trustedLocalCodexContainerHome
} from "../src/lib/problem9-auth.ts";

test("buildTrustedLocalDevboxDockerArgs mounts only auth.json from the host Codex home", () => {
  const authJsonPath = "/host/.codex/auth.json";
  const dockerArgs = buildTrustedLocalDevboxDockerArgs({
    authJsonPath,
    benchmarkPackageRoot: "/host/benchmark",
    image: "paretoproof-problem9-devbox:local",
    outputMountRoot: "/host/outputs",
    outputRoot: "/host/outputs/output-run",
    preflightOnly: false,
    promptPackageRoot: "/host/prompt",
    providerFamily: "openai",
    providerModel: "gpt-5-codex",
    workspaceMountRoot: "/host/workspaces",
    workspaceRoot: "/host/workspaces/workspace-run"
  });
  const mountArgs = dockerArgs.flatMap((argument, index) =>
    dockerArgs[index - 1] === "--mount" ? [argument] : []
  );

  assert.ok(dockerArgs.includes(`CODEX_HOME=${trustedLocalCodexContainerHome}`));
  assert.ok(
    mountArgs.includes(
      `type=bind,src=${authJsonPath},dst=${trustedLocalCodexContainerAuthJsonPath},readonly`
    )
  );
  assert.ok(
    !mountArgs.includes(
      `type=bind,src=/host/.codex,dst=${trustedLocalCodexContainerHome},readonly`
    )
  );
  assert.ok(!mountArgs.some((argument) => argument.includes("src=/host/.codex,dst=")));
});

test("buildTrustedLocalDevboxDockerArgs keeps preflight-only runs free of writable work mounts", () => {
  const dockerArgs = buildTrustedLocalDevboxDockerArgs({
    authJsonPath: "/host/.codex/auth.json",
    benchmarkPackageRoot: null,
    image: "paretoproof-problem9-devbox:local",
    outputMountRoot: null,
    outputRoot: null,
    preflightOnly: true,
    promptPackageRoot: null,
    providerFamily: "openai",
    workspaceMountRoot: null,
    workspaceRoot: null
  });
  const mountArgs = dockerArgs.flatMap((argument, index) =>
    dockerArgs[index - 1] === "--mount" ? [argument] : []
  );

  assert.equal(mountArgs.length, 1);
  assert.match(dockerArgs[dockerArgs.length - 1] ?? "", /codex login status/);
});
