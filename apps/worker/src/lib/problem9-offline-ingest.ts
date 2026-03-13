import { readFile, stat } from "node:fs/promises";
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
  const response = await fetchImpl(endpoint, {
    body: JSON.stringify(localRequest),
    headers: {
      "Cf-Access-Jwt-Assertion": options.accessJwt,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

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

  const request: unknown = {
    bundle: {
      artifactManifest: await loadJsonFile<Problem9OfflineArtifactManifest>(
        path.join(bundleRoot, "artifact-manifest.json")
      ),
      benchmarkPackage: await loadJsonFile<Problem9BenchmarkPackageManifest>(
        path.join(bundleRoot, "package", "benchmark-package.json")
      ),
      candidateSource: await loadTextFile(path.join(bundleRoot, "candidate", "Candidate.lean")),
      compilerDiagnostics: await loadJsonFile(
        path.join(bundleRoot, "verification", "compiler-diagnostics.json")
      ),
      compilerOutput: await loadTextFile(
        path.join(bundleRoot, "verification", "compiler-output.txt")
      ),
      environment: await loadJsonFile<Problem9EnvironmentManifest>(
        path.join(bundleRoot, "environment", "environment.json")
      ),
      packageRef: await loadJsonFile<Problem9PackageRef>(
        path.join(bundleRoot, "package", "package-ref.json")
      ),
      promptPackage: await loadJsonFile<Problem9PromptPackageManifest>(
        path.join(bundleRoot, "prompt", "prompt-package.json")
      ),
      runBundle: await loadJsonFile<Problem9RunBundleManifest>(
        path.join(bundleRoot, "run-bundle.json")
      ),
      usage: await loadOptionalJsonFile(path.join(bundleRoot, "execution", "usage.json")),
      verifierOutput: await loadJsonFile<unknown>(
        path.join(bundleRoot, "verification", "verifier-output.json")
      ),
      verdict: await loadJsonFile<Problem9VerifierVerdict>(
        path.join(bundleRoot, "verification", "verdict.json")
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

  for (const relativePath of requiredBundleFiles) {
    const fullPath = path.join(bundleRoot, relativePath);
    const fileStats = await stat(fullPath).catch(() => null);

    if (!fileStats?.isFile()) {
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
  }
}

async function loadTextFile(filePath: string): Promise<string> {
  return normalizeText(await readFile(filePath, "utf8"));
}

async function loadJsonFile<TValue>(filePath: string): Promise<TValue> {
  return JSON.parse(await loadTextFile(filePath)) as TValue;
}

async function loadOptionalJsonFile<TValue>(filePath: string): Promise<TValue | null> {
  const fileStats = await stat(filePath).catch(() => null);

  if (!fileStats?.isFile()) {
    return null;
  }

  return loadJsonFile<TValue>(filePath);
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
