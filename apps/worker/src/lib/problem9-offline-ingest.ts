import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  problem9OfflineIngestRequestSchema,
  problem9OfflineIngestResponseSchema,
  type Problem9OfflineIngestRequest,
  type Problem9OfflineIngestResponse
} from "@paretoproof/shared";
import type { ZodIssue } from "zod";

type OfflineIngestFetch = typeof fetch;

type Problem9OfflineIngestRequestSummary = {
  attemptId: string;
  jobId: string | null;
  runId: string;
};

export type Problem9OfflineIngestSuccess = {
  ok: true;
  apiBaseUrl: string;
  bundleRoot: string;
  endpoint: string;
  request: Problem9OfflineIngestRequestSummary;
  response: Problem9OfflineIngestResponse;
};

export type Problem9OfflineIngestFailure = {
  ok: false;
  apiBaseUrl: string;
  bundleRoot: string;
  endpoint: string;
  kind:
    | "auth_error"
    | "bundle_validation_error"
    | "response_validation_error"
    | "setup_error"
    | "transport_error"
    | "unexpected_response";
  message: string;
  issues?: unknown[];
  responseBody?: unknown;
  statusCode?: number;
};

type Problem9OfflineIngestFileCatalog = {
  artifactManifestPath: string;
  benchmarkPackagePath: string;
  candidateSourcePath: string;
  compilerDiagnosticsPath: string;
  compilerOutputPath: string;
  environmentPath: string;
  packageRefPath: string;
  promptPackagePath: string;
  runBundlePath: string;
  verifierOutputPath: string;
  verdictPath: string;
};

export class Problem9OfflineIngestCliError extends Error {
  readonly result: Problem9OfflineIngestFailure;

  constructor(result: Problem9OfflineIngestFailure) {
    super(JSON.stringify(result, null, 2));
    this.name = "Problem9OfflineIngestCliError";
    this.result = result;
  }
}

function formatZodIssues(issues: ZodIssue[]) {
  return issues.map((issue) => {
    const fieldPath = issue.path.length > 0 ? issue.path.join(".") : "request";
    return `${fieldPath}: ${issue.message}`;
  });
}

function buildFailureResult(input: Problem9OfflineIngestFailure): Problem9OfflineIngestCliError {
  return new Problem9OfflineIngestCliError(input);
}

function getProblem9OfflineIngestFileCatalog(bundleRoot: string): Problem9OfflineIngestFileCatalog {
  return {
    artifactManifestPath: path.join(bundleRoot, "artifact-manifest.json"),
    benchmarkPackagePath: path.join(bundleRoot, "package", "benchmark-package.json"),
    candidateSourcePath: path.join(bundleRoot, "candidate", "Candidate.lean"),
    compilerDiagnosticsPath: path.join(bundleRoot, "verification", "compiler-diagnostics.json"),
    compilerOutputPath: path.join(bundleRoot, "verification", "compiler-output.txt"),
    environmentPath: path.join(bundleRoot, "environment", "environment.json"),
    packageRefPath: path.join(bundleRoot, "package", "package-ref.json"),
    promptPackagePath: path.join(bundleRoot, "prompt", "prompt-package.json"),
    runBundlePath: path.join(bundleRoot, "run-bundle.json"),
    verifierOutputPath: path.join(bundleRoot, "verification", "verifier-output.json"),
    verdictPath: path.join(bundleRoot, "verification", "verdict.json")
  };
}

async function readJsonFile(filePath: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${label} at ${filePath}: ${message}`);
  }
}

async function readTextFile(filePath: string, label: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${label} at ${filePath}: ${message}`);
  }
}

export async function buildProblem9OfflineIngestRequestFromBundleRoot(
  bundleRoot: string
): Promise<Problem9OfflineIngestRequest> {
  const resolvedBundleRoot = path.resolve(bundleRoot);
  const files = getProblem9OfflineIngestFileCatalog(resolvedBundleRoot);

  let rawRequest: unknown;
  try {
    rawRequest = {
      bundle: {
        artifactManifest: await readJsonFile(files.artifactManifestPath, "artifact manifest"),
        benchmarkPackage: await readJsonFile(files.benchmarkPackagePath, "benchmark package"),
        candidateSource: await readTextFile(files.candidateSourcePath, "candidate source"),
        compilerDiagnostics: await readJsonFile(
          files.compilerDiagnosticsPath,
          "compiler diagnostics"
        ),
        compilerOutput: await readTextFile(files.compilerOutputPath, "compiler output"),
        environment: await readJsonFile(files.environmentPath, "environment manifest"),
        packageRef: await readJsonFile(files.packageRefPath, "package reference"),
        promptPackage: await readJsonFile(files.promptPackagePath, "prompt package"),
        runBundle: await readJsonFile(files.runBundlePath, "run-bundle manifest"),
        usage: null,
        verifierOutput: await readJsonFile(files.verifierOutputPath, "verifier output"),
        verdict: await readJsonFile(files.verdictPath, "verdict")
      },
      ingestRequestSchemaVersion: "1"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Offline ingest bundle validation failed: ${message}`);
  }

  const parsedRequest = problem9OfflineIngestRequestSchema.safeParse(rawRequest);

  if (!parsedRequest.success) {
    throw new Error(
      `Offline ingest bundle validation failed: ${formatZodIssues(parsedRequest.error.issues).join("; ")}`
    );
  }

  return parsedRequest.data as Problem9OfflineIngestRequest;
}

function buildEndpoint(apiBaseUrl: string) {
  return new URL("/portal/admin/offline-ingest/problem9-run-bundles", apiBaseUrl).toString();
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const rawBody = await response.text();

  if (rawBody.length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function getRequestSummary(request: Problem9OfflineIngestRequest): Problem9OfflineIngestRequestSummary {
  return {
    attemptId: request.bundle.runBundle.attemptId,
    jobId: request.bundle.runBundle.jobId,
    runId: request.bundle.runBundle.runId
  };
}

export async function ingestProblem9RunBundle(options: {
  accessJwt: string;
  apiBaseUrl: string;
  bundleRoot: string;
  fetchImpl?: OfflineIngestFetch;
}): Promise<Problem9OfflineIngestSuccess> {
  const apiBaseUrl = options.apiBaseUrl;
  const bundleRoot = path.resolve(options.bundleRoot);
  const endpoint = buildEndpoint(apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  let request: Problem9OfflineIngestRequest;
  try {
    request = await buildProblem9OfflineIngestRequestFromBundleRoot(bundleRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw buildFailureResult({
      apiBaseUrl,
      bundleRoot,
      endpoint,
      kind: "bundle_validation_error",
      message,
      ok: false
    });
  }

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      body: JSON.stringify(request),
      headers: {
        "Cf-Access-Jwt-Assertion": options.accessJwt,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw buildFailureResult({
      apiBaseUrl,
      bundleRoot,
      endpoint,
      kind: "transport_error",
      message: `Offline ingest request failed before the API responded: ${message}`,
      ok: false
    });
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    const issues =
      responseBody &&
      typeof responseBody === "object" &&
      "issues" in responseBody &&
      Array.isArray(responseBody.issues)
        ? responseBody.issues
        : undefined;
    const responseError =
      responseBody &&
      typeof responseBody === "object" &&
      "error" in responseBody &&
      typeof responseBody.error === "string"
        ? responseBody.error
        : response.statusText || "request_failed";

    throw buildFailureResult({
      apiBaseUrl,
      bundleRoot,
      endpoint,
      issues,
      kind: response.status === 401 || response.status === 403 ? "auth_error" : "unexpected_response",
      message: `Offline ingest request was rejected (${response.status} ${responseError}).`,
      ok: false,
      responseBody,
      statusCode: response.status
    });
  }

  const parsedResponse = problem9OfflineIngestResponseSchema.safeParse(responseBody);

  if (!parsedResponse.success) {
    throw buildFailureResult({
      apiBaseUrl,
      bundleRoot,
      endpoint,
      issues: formatZodIssues(parsedResponse.error.issues),
      kind: "response_validation_error",
      message: "Offline ingest API returned a response that did not match the shared schema.",
      ok: false,
      responseBody,
      statusCode: response.status
    });
  }

  return {
    apiBaseUrl,
    bundleRoot,
    endpoint,
    ok: true,
    request: getRequestSummary(request),
    response: parsedResponse.data
  };
}
