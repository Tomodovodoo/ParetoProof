export const workerCliExitCodes = {
  success: 0,
  internal: 1,
  validation: 2,
  runtime: 3
} as const;

type WorkerCliExitCode =
  (typeof workerCliExitCodes)[keyof typeof workerCliExitCodes];

export type WorkerCliFailureKind = "internal" | "runtime" | "validation";

export class WorkerCliError extends Error {
  readonly exitCode: WorkerCliExitCode;
  readonly kind: WorkerCliFailureKind;

  constructor(kind: WorkerCliFailureKind, message: string) {
    super(message);
    this.name = "WorkerCliError";
    this.kind = kind;
    this.exitCode = workerCliExitCodes[kind];
  }
}

const validationMessagePatterns = [
  /^Invalid worker runtime environment:/u,
  /^Missing required /u,
  /^Unknown worker command:/u,
  /^Unsupported /u,
  /^Trusted-local Codex auth preflight failed\./u,
  /^Trusted-local devbox runs currently support only provider-family /u,
  /^Trusted-local devbox runs require --provider-model/u,
  /^Failing bundles require --failure-classification <path>\./u,
  /^Passing bundles may not include a failure classification\./u,
  /requires a readable Codex auth\.json/u,
  /may not be a top-level directory/u,
  /must be an existing directory:/u,
  /must be either true or false\./u,
  /must not be a filesystem root:/u,
  /overlaps .* on the host filesystem/u
] as const;

const runtimeMessagePatterns = [
  /\bdocker run exited with code\b/u,
  /\bcodex exec failed\b/ui,
  /\bfetch failed\b/ui,
  /\bECONNREFUSED\b/u,
  /\btimed out\b/ui
] as const;

function isZodErrorLike(error: unknown): error is { issues: unknown[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown[] }).issues)
  );
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function classifyWorkerCliError(error: unknown): WorkerCliError {
  if (error instanceof WorkerCliError) {
    return error;
  }

  const message = normalizeErrorMessage(error);

  if (
    isZodErrorLike(error) ||
    validationMessagePatterns.some((pattern) => pattern.test(message))
  ) {
    return new WorkerCliError("validation", message);
  }

  if (runtimeMessagePatterns.some((pattern) => pattern.test(message))) {
    return new WorkerCliError("runtime", message);
  }

  return new WorkerCliError("internal", message);
}

export function formatWorkerCliError(error: unknown): string {
  const failure = classifyWorkerCliError(error);
  const label =
    failure.kind === "validation"
      ? "Validation error"
      : failure.kind === "runtime"
        ? "Runtime error"
        : "Internal error";

  return `${label}: ${failure.message}`;
}

export function reportWorkerCliError(error: unknown): WorkerCliExitCode {
  const failure = classifyWorkerCliError(error);
  console.error(formatWorkerCliError(failure));
  return failure.exitCode;
}

export function rejectedOfflineIngestExitCode(stage: string) {
  return stage === "remote_rejection"
    ? workerCliExitCodes.runtime
    : workerCliExitCodes.validation;
}
