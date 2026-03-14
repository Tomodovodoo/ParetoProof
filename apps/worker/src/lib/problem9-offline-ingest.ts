import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  problem9OfflineIngestRequestSchema,
  problem9OfflineIngestResponseSchema,
  type Problem9BenchmarkPackageManifest,
  type Problem9EnvironmentManifest,
  type Problem9OfflineArtifactManifest,
  type Problem9OfflineIngestRequest,
  type Problem9OfflineIngestResponse,
  type Problem9PackageRef,
  type Problem9PromptPackageManifest,
  type Problem9RunBundleManifest,
  type Problem9VerifierVerdict
} from "@paretoproof/shared";
import { parseWorkerRuntimeEnv } from "./runtime.js";

type RejectedOfflineIngestResult = {
  bundleRoot: string;
  endpoint: string;
  error: string;
  httpStatus?: number;
  issues?: Array<{ message: string; path?: string }>;
  stage: "local_validation" | "remote_rejection";
  status: "rejected";
};

type AcceptedOfflineIngestResult = Problem9OfflineIngestResponse & {
  bundleRoot: string;
  endpoint: string;
  status: "accepted";
};

export type Problem9OfflineIngestResult =
  | AcceptedOfflineIngestResult
  | RejectedOfflineIngestResult;

type OfflineIngestDependencies = {
  fetchImpl?: typeof fetch;
  runtimeEnv?: Partial<Record<string, string | undefined>>;
};

const requiredBundleFiles = [
  "artifact-manifest.json",
  "run-bundle.json",
  "package/benchmark-package.json",
  "package/package-ref.json",
  "prompt/prompt-package.json",
  "candidate/Candidate.lean",
  "verification/compiler-diagnostics.json",
  "verification/compiler-output.txt",
  "verification/verdict.json",
  "verification/verifier-output.json",
  "environment/environment.json"
] as const;

export async function runProblem9OfflineIngest(
  options: {
    accessJwt: string;
    bundleRoot: string;
  },
  dependencies: OfflineIngestDependencies = {}
): Promise<Problem9OfflineIngestResult> {
  const runtimeEnv = await parseWorkerRuntimeEnv(
    {
      commandFamily: "offline_ingest_cli"
    },
    dependencies.runtimeEnv
  );
  const apiBaseUrl = runtimeEnv.apiBaseUrl;

  if (!apiBaseUrl) {
    throw new Error("Offline ingest runtime did not resolve API_BASE_URL.");
  }

  const endpoint = new URL(
    "/portal/admin/offline-ingest/problem9-run-bundles",
    apiBaseUrl
  ).toString();
  const bundleRoot = path.resolve(options.bundleRoot);
  const localRequest = await loadProblem9OfflineIngestRequest(bundleRoot).catch((error: unknown) =>
    toLocalValidationResult(error, bundleRoot, endpoint)
  );

  if ("status" in localRequest) {
    return localRequest;
  }

  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  let response: Response;

  try {
    response = await fetchImpl(endpoint, {
      body: JSON.stringify(localRequest),
      headers: {
        "Cf-Access-Jwt-Assertion": options.accessJwt,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  } catch (error) {
    return {
      bundleRoot,
      endpoint,
      error: "offline_ingest_transport_error",
      issues: [
        {
          message: error instanceof Error ? error.message : String(error)
        }
      ],
      stage: "remote_rejection",
      status: "rejected"
    };
  }

  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    return {
      bundleRoot,
      endpoint,
      error:
        responseBody && typeof responseBody === "object" && "error" in responseBody
          ? String(responseBody.error)
          : `offline_ingest_http_${response.status}`,
      httpStatus: response.status,
      issues:
        responseBody &&
        typeof responseBody === "object" &&
        "issues" in responseBody &&
        Array.isArray(responseBody.issues)
          ? responseBody.issues
              .filter((issue) => issue && typeof issue === "object" && "message" in issue)
              .map((issue) => ({
                message: String(issue.message),
                path: "path" in issue && typeof issue.path === "string" ? issue.path : undefined
              }))
          : undefined,
      stage: "remote_rejection",
      status: "rejected"
    };
  }

  const parsedResponse = problem9OfflineIngestResponseSchema.safeParse(responseBody);

  if (!parsedResponse.success) {
    return {
      bundleRoot,
      endpoint,
      error: "invalid_problem9_offline_ingest_response",
      issues: parsedResponse.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join(".")
      })),
      stage: "remote_rejection",
      status: "rejected"
    };
  }

  return {
    ...parsedResponse.data,
    bundleRoot,
    endpoint,
    status: "accepted"
  };
}

async function loadProblem9OfflineIngestRequest(
  bundleRoot: string
): Promise<Problem9OfflineIngestRequest> {
  await ensureBundleRoot(bundleRoot);
  const bundleRootRealPath = await realpath(bundleRoot);

  const request: unknown = {
    bundle: {
      artifactManifest: await loadJsonFile<Problem9OfflineArtifactManifest>(
        bundleRootRealPath,
        "artifact-manifest.json"
      ),
      benchmarkPackage: await loadJsonFile<Problem9BenchmarkPackageManifest>(
        bundleRootRealPath,
        "package/benchmark-package.json"
      ),
      candidateSource: await loadTextFile(bundleRootRealPath, "candidate/Candidate.lean"),
      compilerDiagnostics: await loadJsonFile(
        bundleRootRealPath,
        "verification/compiler-diagnostics.json"
      ),
      compilerOutput: await loadTextFile(bundleRootRealPath, "verification/compiler-output.txt"),
      environment: await loadJsonFile<Problem9EnvironmentManifest>(
        bundleRootRealPath,
        "environment/environment.json"
      ),
      packageRef: await loadJsonFile<Problem9PackageRef>(
        bundleRootRealPath,
        "package/package-ref.json"
      ),
      promptPackage: await loadJsonFile<Problem9PromptPackageManifest>(
        bundleRootRealPath,
        "prompt/prompt-package.json"
      ),
      runBundle: await loadJsonFile<Problem9RunBundleManifest>(
        bundleRootRealPath,
        "run-bundle.json"
      ),
      usage: await loadOptionalJsonFile(bundleRootRealPath, "execution/usage.json"),
      verifierOutput: await loadJsonFile<unknown>(
        bundleRootRealPath,
        "verification/verifier-output.json"
      ),
      verdict: await loadJsonFile<Problem9VerifierVerdict>(
        bundleRootRealPath,
        "verification/verdict.json"
      )
    },
    ingestRequestSchemaVersion: "1"
  };

  const parsedRequest = problem9OfflineIngestRequestSchema.safeParse(request);

  if (!parsedRequest.success) {
    throw new Error(
      JSON.stringify(
        {
          code: "invalid_problem9_offline_ingest_bundle_root",
          issues: parsedRequest.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.join(".")
          }))
        },
        null,
        2
      )
    );
  }

  return parsedRequest.data as Problem9OfflineIngestRequest;
}

async function ensureBundleRoot(bundleRoot: string): Promise<void> {
  const bundleRootStats = await stat(bundleRoot).catch(() => null);

  if (!bundleRootStats?.isDirectory()) {
    throw new Error(
      JSON.stringify(
        {
          code: "invalid_problem9_offline_ingest_bundle_root",
          issues: [
            {
              message: `Expected a problem9-run-bundle directory at ${bundleRoot}.`,
              path: bundleRoot
            }
          ]
        },
        null,
        2
      )
    );
  }

  const bundleRootRealPath = await realpath(bundleRoot);

  for (const relativePath of requiredBundleFiles) {
    await resolveBundleFilePath(bundleRootRealPath, relativePath);
  }
}

async function loadTextFile(bundleRootRealPath: string, relativePath: string): Promise<string> {
  const filePath = await resolveBundleFilePath(bundleRootRealPath, relativePath);

  return normalizeText(await readFile(filePath, "utf8"));
}

async function loadJsonFile<TValue>(
  bundleRootRealPath: string,
  relativePath: string
): Promise<TValue> {
  return JSON.parse(await loadTextFile(bundleRootRealPath, relativePath)) as TValue;
}

async function loadOptionalJsonFile<TValue>(
  bundleRootRealPath: string,
  relativePath: string
): Promise<TValue | null> {
  const fullPath = path.join(bundleRootRealPath, relativePath);
  const fileStats = await lstat(fullPath).catch(() => null);

  if (!fileStats) {
    return null;
  }

  if (!fileStats.isFile()) {
    return null;
  }

  await resolveBundleFilePath(bundleRootRealPath, relativePath);

  return loadJsonFile<TValue>(bundleRootRealPath, relativePath);
}

async function resolveBundleFilePath(
  bundleRootRealPath: string,
  relativePath: string
): Promise<string> {
  const fullPath = path.join(bundleRootRealPath, relativePath);
  const fileStats = await lstat(fullPath).catch(() => null);

  if (!fileStats?.isFile() || fileStats.isSymbolicLink()) {
    throw new Error(
      JSON.stringify(
        {
          code: "invalid_problem9_offline_ingest_bundle_root",
          issues: [
            {
              message: `Missing required offline ingest bundle file ${relativePath}.`,
              path: relativePath
            }
          ]
        },
        null,
        2
      )
    );
  }

  const resolvedFilePath = await realpath(fullPath);
  const relativeResolvedPath = path.relative(bundleRootRealPath, resolvedFilePath);

  if (
    relativeResolvedPath.startsWith("..") ||
    path.isAbsolute(relativeResolvedPath) ||
    relativeResolvedPath.length === 0
  ) {
    throw new Error(
      JSON.stringify(
        {
          code: "invalid_problem9_offline_ingest_bundle_root",
          issues: [
            {
              message: `Offline ingest bundle file ${relativePath} must stay within the bundle root.`,
              path: relativePath
            }
          ]
        },
        null,
        2
      )
    );
  }

  return fullPath;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const responseText = await response.text();

  if (responseText.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      error: responseText
    };
  }
}

function toLocalValidationResult(
  error: unknown,
  bundleRoot: string,
  endpoint: string
): RejectedOfflineIngestResult {
  const parsed = parseStructuredError(error);

  return {
    bundleRoot,
    endpoint,
    error: parsed.code,
    issues: parsed.issues,
    stage: "local_validation",
    status: "rejected"
  };
}

function parseStructuredError(error: unknown): {
  code: string;
  issues: Array<{ message: string; path?: string }>;
} {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as {
        code?: unknown;
        issues?: Array<{ message?: unknown; path?: unknown }>;
      };

      if (typeof parsed.code === "string" && Array.isArray(parsed.issues)) {
        return {
          code: parsed.code,
          issues: parsed.issues
            .filter((issue) => issue && typeof issue === "object")
            .map((issue) => ({
              message: typeof issue.message === "string" ? issue.message : "Unknown issue.",
              path: typeof issue.path === "string" ? issue.path : undefined
            }))
        };
      }
    } catch {
      return {
        code: "invalid_problem9_offline_ingest_bundle_root",
        issues: [
          {
            message: error.message
          }
        ]
      };
    }
  }

  return {
    code: "invalid_problem9_offline_ingest_bundle_root",
    issues: [
      {
        message: String(error)
      }
    ]
  };
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
