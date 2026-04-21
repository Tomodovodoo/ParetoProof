import { createHash, randomBytes } from "node:crypto";
import type {
  WorkerActiveJob,
  WorkerBundleArtifactRole,
  WorkerJobTokenScope,
  WorkerRunTarget
} from "@paretoproof/shared";

export const problem9WorkerIdlePollAfterSeconds = 30;
export const problem9WorkerHeartbeatIntervalSeconds = 60;
export const problem9WorkerHeartbeatTimeoutSeconds = 180;
export const problem9WorkerRunBundleSchemaVersion = "1";

export const requiredProblem9ArtifactRoles = [
  "package_reference",
  "prompt_package",
  "candidate_source",
  "verdict_record",
  "compiler_output",
  "compiler_diagnostics",
  "verifier_output",
  "environment_snapshot"
] satisfies WorkerBundleArtifactRole[];

export const issuedProblem9JobTokenScopes = [
  "heartbeat",
  "event_append",
  "artifact_manifest_write",
  "verifier_verdict_write",
  "result_finalize",
  "failure_finalize"
] satisfies WorkerJobTokenScope[];

export function addSeconds(timestamp: Date, seconds: number) {
  return new Date(timestamp.getTime() + seconds * 1000);
}

export function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function issueWorkerJobToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: sha256Text(token)
  };
}

export function createProblem9JobTokenExpiry(now: Date) {
  return addSeconds(now, problem9WorkerHeartbeatTimeoutSeconds);
}

export function createProblem9WorkerActiveJob(options: {
  attemptId: string;
  jobId: string;
  jobToken: string;
  jobTokenExpiresAt: Date;
  leaseExpiresAt: Date;
  leaseId: string;
  runId: string;
  target: WorkerRunTarget;
}): WorkerActiveJob {
  return {
    attemptId: options.attemptId,
    heartbeatIntervalSeconds: problem9WorkerHeartbeatIntervalSeconds,
    heartbeatTimeoutSeconds: problem9WorkerHeartbeatTimeoutSeconds,
    jobId: options.jobId,
    jobToken: options.jobToken,
    jobTokenExpiresAt: options.jobTokenExpiresAt.toISOString(),
    jobTokenScopes: [...issuedProblem9JobTokenScopes],
    leaseExpiresAt: options.leaseExpiresAt.toISOString(),
    leaseId: options.leaseId,
    offlineBundleCompatible: true,
    requiredArtifactRoles: [...requiredProblem9ArtifactRoles],
    runBundleSchemaVersion: problem9WorkerRunBundleSchemaVersion,
    runId: options.runId,
    target: options.target
  };
}
