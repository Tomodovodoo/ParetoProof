import assert from "node:assert/strict";
import test from "node:test";
import {
  linuxMountInfoListsMountPoint,
  trustedLocalCodexContainerAuthJsonPath
} from "../src/lib/trusted-local-codex.ts";

test("linuxMountInfoListsMountPoint matches the trusted-local auth file mount point", () => {
  const mountInfo = [
    "185 35 0:68 / / rw,relatime - overlay overlay rw",
    `212 185 0:71 /host/auth.json ${trustedLocalCodexContainerAuthJsonPath} ro,relatime - ext4 /dev/sda ro`
  ].join("\n");

  assert.equal(
    linuxMountInfoListsMountPoint(mountInfo, trustedLocalCodexContainerAuthJsonPath),
    true
  );
});

test("linuxMountInfoListsMountPoint rejects unrelated mount points", () => {
  const mountInfo = [
    "185 35 0:68 / / rw,relatime - overlay overlay rw",
    "212 185 0:71 /host/auth.json /run/paretoproof/other/auth.json ro,relatime - ext4 /dev/sda ro"
  ].join("\n");

  assert.equal(
    linuxMountInfoListsMountPoint(mountInfo, trustedLocalCodexContainerAuthJsonPath),
    false
  );
});
