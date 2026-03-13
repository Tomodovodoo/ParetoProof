import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  type Problem9OfflineArtifactManifest,
  type Problem9OfflineIngestRequest,
  type Problem9OfflineIngestResponse,
  problem9BenchmarkPackageManifestSchema,
  problem9EnvironmentManifestSchema,
  problem9OfflineArtifactManifestSchema,
  problem9OfflineIngestRequestSchema,
  problem9OfflineIngestResponseSchema,
  problem9PackageRefSchema,
  problem9PromptPackageManifestSchema,
  problem9RunBundleManifestSchema,
  problem9VerifierVerdictSchema
} from "@paretoproof/shared";

const requiredBundleFilePaths = [
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

type WorkerFetch = typeof fetch;

type LoadedBundle = {
  artifactManifest: Problem9OfflineArtifactManifest;
  benchmarkPackage: ReturnType<typeof problem9BenchmarkPackageManifestSchema.parse>;
  candidateSource: string;
  compilerDiagnostics: unknown;
  compilerOutput: string;
  environment: ReturnType<typeof problem9EnvironmentManifestSchema.parse>;
  packageRef: ReturnType<typeof problem9PackageRefSchema.parse>;
  promptPackage: ReturnType<typeof problem9PromptPackageManifestSchema.parse>;
  runBundle: ReturnType<typeof problem9RunBundleManifestSchema.parse>;
  verifierOutput: unknown;
  verdict: ReturnType<typeof problem9VerifierVerdictSchema.parse>;
};

export type Problem9OfflineIngestSubmission = {
  bundleRoot: string;
  endpoint: string;
  request: Problem9OfflineIngestRequest;
  response: Problem9OfflineIngestResponse;
};

export async function buildProblem9OfflineIngestRequest(
  rawBundleRoot: string
): Promise<Problem9OfflineIngestRequest> {
  const bundleRoot = path.resolve(rawBundleRoot);
  const bundle = await loadBundle(bundleRoot);
  const request = {
    bundle: {
      artifactManifest: bundle.artifactManifest,
      benchmarkPackage: bundle.benchmarkPackage,
      candidateSource: bundle.candidateSource,
      compilerDiagnostics: bundle.compilerDiagnostics,
      compilerOutput: bundle.compilerOutput,
      environment: bundle.environment,
      packageRef: bundle.packageRef,
      promptPackage: bundle.promptPackage,
      runBundle: bundle.runBundle,
      usage: null,
      verifierOutput: bundle.verifierOutput,
      verdict: bundle.verdict
    },
    ingestRequestSchemaVersion: "1"
  };

  return problem9OfflineIngestRequestSchema.parse(request) as Problem9OfflineIngestRequest;
}

export async function ingestProblem9RunBundle(
  options: {
    accessJwtAssertion: string;
    apiBaseUrl: string;
    bundleRoot: string;
  },
  dependencies: {
    fetchImpl?: WorkerFetch;
  } = {}
): Promise<Problem9OfflineIngestSubmission> {
  const request = await buildProblem9OfflineIngestRequest(options.bundleRoot);
  const endpoint = new URL(
    "/portal/admin/offline-ingest/problem9-run-bundles",
    options.apiBaseUrl
  ).toString();
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Cf-Access-Jwt-Assertion": options.accessJwtAssertion,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  const rawResponseBody = await response.text();
  const parsedBody = parseOptionalJson(rawResponseBody);

  if (!response.ok) {
    const error = new Error(
      `Offline ingest request failed with status ${response.status}${rawResponseBody ? `: ${rawResponseBody}` : "."}`
    ) as Error & {
      issues?: unknown[];
      responseBody?: unknown;
      responseStatus?: number;
      responseStatusText?: string;
      serverErrorCode?: string;
    };
    error.issues =
      parsedBody &&
      typeof parsedBody === "object" &&
      "issues" in parsedBody &&
      Array.isArray(parsedBody.issues)
        ? parsedBody.issues
        : undefined;
    error.responseBody = parsedBody;
    error.responseStatus = response.status;
    error.responseStatusText = response.statusText;
    error.serverErrorCode =
      parsedBody && typeof parsedBody === "object" && "error" in parsedBody
        ? String(parsedBody.error)
        : "offline_ingest_http_error";
    throw error;
  }

  const parsedResponse = problem9OfflineIngestResponseSchema.safeParse(parsedBody);

  if (!parsedResponse.success) {
    const error = new Error("Offline ingest route returned an invalid response payload.") as Error & {
      responseBody?: unknown;
      responseStatus?: number;
      responseStatusText?: string;
    };
    error.responseBody = parsedBody;
    error.responseStatus = response.status;
    error.responseStatusText = response.statusText;
    throw error;
  }

  return {
    bundleRoot: path.resolve(options.bundleRoot),
    endpoint,
    request,
    response: parsedResponse.data
  };
}

async function loadBundle(bundleRoot: string): Promise<LoadedBundle> {
  await ensureDirectory(bundleRoot, "bundle root");

  const artifactManifest = await loadJsonFile(
    path.join(bundleRoot, "artifact-manifest.json"),
    problem9OfflineArtifactManifestSchema
  );
  const benchmarkPackage = await loadJsonFile(
    path.join(bundleRoot, "package", "benchmark-package.json"),
    problem9BenchmarkPackageManifestSchema
  );
  const packageRef = await loadJsonFile(
    path.join(bundleRoot, "package", "package-ref.json"),
    problem9PackageRefSchema
  );
  const promptPackage = await loadJsonFile(
    path.join(bundleRoot, "prompt", "prompt-package.json"),
    problem9PromptPackageManifestSchema
  );
  const runBundle = await loadJsonFile(
    path.join(bundleRoot, "run-bundle.json"),
    problem9RunBundleManifestSchema
  );
  const verdict = await loadJsonFile(
    path.join(bundleRoot, "verification", "verdict.json"),
    problem9VerifierVerdictSchema
  );
  const environment = await loadJsonFile(
    path.join(bundleRoot, "environment", "environment.json"),
    problem9EnvironmentManifestSchema
  );
  const compilerDiagnostics = await loadLooseJsonFile(
    path.join(bundleRoot, "verification", "compiler-diagnostics.json")
  );
  const verifierOutput = await loadLooseJsonFile(
    path.join(bundleRoot, "verification", "verifier-output.json")
  );
  const candidateSource = await loadNormalizedText(
    path.join(bundleRoot, "candidate", "Candidate.lean")
  );
  const compilerOutput = await loadNormalizedText(
    path.join(bundleRoot, "verification", "compiler-output.txt")
  );

  await validateArtifactManifest(bundleRoot, artifactManifest);
  await validateBundleConsistency(bundleRoot, {
    artifactManifest,
    benchmarkPackage,
    environment,
    packageRef,
    promptPackage,
    runBundle,
    verdict
  });

  return {
    artifactManifest,
    benchmarkPackage,
    candidateSource,
    compilerDiagnostics,
    compilerOutput,
    environment,
    packageRef,
    promptPackage,
    runBundle,
    verifierOutput,
    verdict
  };
}

async function validateArtifactManifest(
  bundleRoot: string,
  artifactManifest: Problem9OfflineArtifactManifest
): Promise<void> {
  const manifestEntriesByPath = new Map(
    artifactManifest.artifacts.map((entry) => [entry.relativePath, entry])
  );

  for (const relativePath of requiredBundleFilePaths) {
    const manifestEntry = manifestEntriesByPath.get(relativePath);

    if (!manifestEntry) {
      throw new Error(`Artifact manifest is missing required entry ${relativePath}.`);
    }

    if (!manifestEntry.requiredForIngest) {
      throw new Error(`Required ingest artifact ${relativePath} must set requiredForIngest=true.`);
    }
  }

  for (const manifestEntry of artifactManifest.artifacts) {
    const fullPath = resolveBundleFilePath(bundleRoot, manifestEntry.relativePath);
    const fileStats = await stat(fullPath);

    if (!fileStats.isFile()) {
      throw new Error(`Artifact manifest path is not a file: ${manifestEntry.relativePath}.`);
    }

    if (fileStats.size !== manifestEntry.byteSize) {
      throw new Error(
        `Artifact manifest byteSize mismatch for ${manifestEntry.relativePath}: expected ${manifestEntry.byteSize}, got ${fileStats.size}.`
      );
    }

    const actualSha256 = await sha256FileForBundleArtifact(fullPath);
    if (actualSha256 !== manifestEntry.sha256.toLowerCase()) {
      throw new Error(
        `Artifact manifest digest mismatch for ${manifestEntry.relativePath}: expected ${manifestEntry.sha256}, got ${actualSha256}.`
      );
    }

    const expectedMediaType = expectedMediaTypeForPath(manifestEntry.relativePath);
    if (expectedMediaType !== manifestEntry.mediaType) {
      throw new Error(
        `Artifact manifest mediaType mismatch for ${manifestEntry.relativePath}: expected ${expectedMediaType ?? "null"}, got ${manifestEntry.mediaType ?? "null"}.`
      );
    }

    if (manifestEntry.contentEncoding !== null) {
      throw new Error(
        `Artifact manifest contentEncoding for ${manifestEntry.relativePath} must be null in the canonical offline bundle.`
      );
    }

    const expectedArtifactRole = expectedArtifactRoleForPath(manifestEntry.relativePath);
    if (expectedArtifactRole !== null && manifestEntry.artifactRole !== expectedArtifactRole) {
      throw new Error(
        `Artifact manifest role mismatch for ${manifestEntry.relativePath}: expected ${expectedArtifactRole}, got ${manifestEntry.artifactRole}.`
      );
    }
  }
}

async function validateBundleConsistency(
  bundleRoot: string,
  bundle: Omit<LoadedBundle, "candidateSource" | "compilerDiagnostics" | "compilerOutput" | "verifierOutput">
): Promise<void> {
  const artifactManifestDigest = await sha256NormalizedFile(
    path.join(bundleRoot, "artifact-manifest.json")
  );
  if (artifactManifestDigest !== bundle.runBundle.artifactManifestDigest.toLowerCase()) {
    throw new Error(
      `Run bundle artifactManifestDigest mismatch: expected ${bundle.runBundle.artifactManifestDigest}, got ${artifactManifestDigest}.`
    );
  }

  const candidateDigest = await sha256NormalizedFile(
    path.join(bundleRoot, "candidate", "Candidate.lean")
  );
  if (candidateDigest !== bundle.runBundle.candidateDigest.toLowerCase()) {
    throw new Error(
      `Run bundle candidateDigest mismatch: expected ${bundle.runBundle.candidateDigest}, got ${candidateDigest}.`
    );
  }

  if (candidateDigest !== bundle.verdict.candidateDigest.toLowerCase()) {
    throw new Error("Verdict candidateDigest does not match the candidate source file.");
  }

  const environmentDigest = sha256Text(stableStringify(bundle.environment));
  if (environmentDigest !== bundle.runBundle.environmentDigest.toLowerCase()) {
    throw new Error(
      `Run bundle environmentDigest mismatch: expected ${bundle.runBundle.environmentDigest}, got ${environmentDigest}.`
    );
  }

  const verdictDigest = sha256Text(stableStringify(bundle.verdict));
  if (verdictDigest !== bundle.runBundle.verdictDigest.toLowerCase()) {
    throw new Error(
      `Run bundle verdictDigest mismatch: expected ${bundle.runBundle.verdictDigest}, got ${verdictDigest}.`
    );
  }

  if (bundle.promptPackage.benchmarkPackageDigest !== bundle.benchmarkPackage.packageDigest) {
    throw new Error("Prompt package benchmarkPackageDigest does not match the benchmark package manifest.");
  }

  if (bundle.packageRef.benchmarkPackageDigest !== bundle.benchmarkPackage.packageDigest) {
    throw new Error("Package ref benchmarkPackageDigest does not match the benchmark package manifest.");
  }

  if (bundle.runBundle.benchmarkPackageDigest !== bundle.benchmarkPackage.packageDigest) {
    throw new Error("Run bundle benchmarkPackageDigest does not match the benchmark package manifest.");
  }

  if (bundle.verdict.benchmarkPackageDigest !== bundle.benchmarkPackage.packageDigest) {
    throw new Error("Verdict benchmarkPackageDigest does not match the benchmark package manifest.");
  }

  if (bundle.packageRef.laneId !== bundle.promptPackage.laneId) {
    throw new Error("Package ref laneId does not match the prompt package manifest.");
  }

  if (bundle.environment.laneId !== bundle.promptPackage.laneId) {
    throw new Error("Environment laneId does not match the prompt package manifest.");
  }

  if (bundle.runBundle.laneId !== bundle.promptPackage.laneId) {
    throw new Error("Run bundle laneId does not match the prompt package manifest.");
  }

  if (bundle.verdict.laneId !== bundle.promptPackage.laneId) {
    throw new Error("Verdict laneId does not match the prompt package manifest.");
  }

  if (bundle.runBundle.promptPackageDigest !== bundle.promptPackage.promptPackageDigest) {
    throw new Error("Run bundle promptPackageDigest does not match the prompt package manifest.");
  }

  if (bundle.runBundle.harnessRevision !== bundle.promptPackage.harnessRevision) {
    throw new Error("Run bundle harnessRevision does not match the prompt package manifest.");
  }

  if (bundle.environment.harnessRevision !== bundle.promptPackage.harnessRevision) {
    throw new Error("Environment harnessRevision does not match the prompt package manifest.");
  }

  if (bundle.runBundle.modelConfigId !== bundle.promptPackage.modelConfigId) {
    throw new Error("Run bundle modelConfigId does not match the prompt package manifest.");
  }

  if (bundle.environment.modelConfigId !== bundle.promptPackage.modelConfigId) {
    throw new Error("Environment modelConfigId does not match the prompt package manifest.");
  }

  if (bundle.runBundle.providerFamily !== bundle.promptPackage.providerFamily) {
    throw new Error("Run bundle providerFamily does not match the prompt package manifest.");
  }

  if (bundle.environment.providerFamily !== bundle.promptPackage.providerFamily) {
    throw new Error("Environment providerFamily does not match the prompt package manifest.");
  }

  if (bundle.runBundle.authMode !== bundle.promptPackage.authMode) {
    throw new Error("Run bundle authMode does not match the prompt package manifest.");
  }

  if (bundle.environment.authMode !== bundle.promptPackage.authMode) {
    throw new Error("Environment authMode does not match the prompt package manifest.");
  }

  if (bundle.runBundle.runMode !== bundle.promptPackage.runMode) {
    throw new Error("Run bundle runMode does not match the prompt package manifest.");
  }

  if (bundle.environment.runMode !== bundle.promptPackage.runMode) {
    throw new Error("Environment runMode does not match the prompt package manifest.");
  }

  if (bundle.runBundle.toolProfile !== bundle.promptPackage.toolProfile) {
    throw new Error("Run bundle toolProfile does not match the prompt package manifest.");
  }

  if (bundle.environment.toolProfile !== bundle.promptPackage.toolProfile) {
    throw new Error("Environment toolProfile does not match the prompt package manifest.");
  }

  if (bundle.runBundle.promptProtocolVersion !== bundle.promptPackage.promptProtocolVersion) {
    throw new Error("Run bundle promptProtocolVersion does not match the prompt package manifest.");
  }

  if (bundle.environment.promptProtocolVersion !== bundle.promptPackage.promptProtocolVersion) {
    throw new Error("Environment promptProtocolVersion does not match the prompt package manifest.");
  }

  if (bundle.runBundle.attemptId !== bundle.verdict.attemptId) {
    throw new Error("Run bundle attemptId does not match the verdict payload.");
  }

  if (bundle.runBundle.runId !== bundle.verdict.runId) {
    throw new Error("Run bundle runId does not match the verdict payload.");
  }

  if (bundle.runBundle.modelSnapshotId !== bundle.environment.modelSnapshotId) {
    throw new Error("Run bundle modelSnapshotId does not match the environment manifest.");
  }

  if (bundle.runBundle.verifierVersion !== bundle.environment.verifierVersion) {
    throw new Error("Run bundle verifierVersion does not match the environment manifest.");
  }

  const expectedStatus = bundle.verdict.result === "pass" ? "success" : "failure";
  if (bundle.runBundle.status !== expectedStatus) {
    throw new Error(
      `Run bundle status ${bundle.runBundle.status} does not match verdict result ${bundle.verdict.result}.`
    );
  }

  if (bundle.verdict.result === "pass" && bundle.verdict.primaryFailure !== null) {
    throw new Error("Passing verdict payloads must not include primaryFailure.");
  }

  const bundleDigest = sha256Text(
    stableStringify({
      artifactInventory: bundle.artifactManifest.artifacts,
      runBundle: omitDigestFields(bundle.runBundle)
    })
  );

  if (bundleDigest !== bundle.runBundle.bundleDigest.toLowerCase()) {
    throw new Error(
      `Run bundle digest mismatch: expected ${bundle.runBundle.bundleDigest}, got ${bundleDigest}.`
    );
  }
}

async function ensureDirectory(directoryPath: string, description: string): Promise<void> {
  const directoryStats = await stat(directoryPath);

  if (!directoryStats.isDirectory()) {
    throw new Error(`Expected ${description} to be a directory: ${directoryPath}.`);
  }
}

function resolveBundleFilePath(bundleRoot: string, relativePath: string): string {
  const normalizedBundleRoot = path.resolve(bundleRoot);
  const fullPath = path.resolve(normalizedBundleRoot, relativePath);
  const allowedPrefix = `${normalizedBundleRoot}${path.sep}`;

  if (fullPath !== normalizedBundleRoot && !fullPath.startsWith(allowedPrefix)) {
    throw new Error(`Artifact manifest path escapes the bundle root: ${relativePath}.`);
  }

  return fullPath;
}

async function ensureFile(filePath: string): Promise<void> {
  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error(`Expected bundle input file: ${filePath}.`);
  }
}

async function loadJsonFile<T>(filePath: string, schema: { parse: (value: unknown) => T }): Promise<T> {
  await ensureFile(filePath);
  return schema.parse(JSON.parse(normalizeText(await readFile(filePath, "utf8"))));
}

async function loadLooseJsonFile(filePath: string): Promise<unknown> {
  await ensureFile(filePath);
  return JSON.parse(normalizeText(await readFile(filePath, "utf8")));
}

async function loadNormalizedText(filePath: string): Promise<string> {
  await ensureFile(filePath);
  return normalizeText(await readFile(filePath, "utf8"));
}

async function sha256NormalizedFile(filePath: string): Promise<string> {
  return sha256Text(await loadNormalizedText(filePath));
}

async function sha256FileForBundleArtifact(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json" || extension === ".txt" || extension === ".lean" || extension === ".md") {
    return sha256NormalizedFile(filePath);
  }

  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(normalizeText(text), "utf8")).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}

function omitDigestFields<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !key.toLowerCase().endsWith("digest"))
  );
}

function expectedArtifactRoleForPath(relativePath: string): string | null {
  switch (relativePath) {
    case "package/package-ref.json":
    case "package/benchmark-package.json":
      return "package_reference";
    case "prompt/prompt-package.json":
      return "prompt_package";
    case "candidate/Candidate.lean":
      return "candidate_source";
    case "verification/verdict.json":
      return "verdict_record";
    case "verification/compiler-output.txt":
      return "compiler_output";
    case "verification/compiler-diagnostics.json":
      return "compiler_diagnostics";
    case "verification/verifier-output.json":
      return "verifier_output";
    case "environment/environment.json":
      return "environment_snapshot";
    default:
      return null;
  }
}

function expectedMediaTypeForPath(relativePath: string): string | null {
  if (relativePath.endsWith(".json")) {
    return "application/json";
  }

  if (relativePath.endsWith(".txt") || relativePath.endsWith(".lean")) {
    return "text/plain";
  }

  return null;
}

function parseOptionalJson(rawText: string): unknown {
  const normalized = rawText.trim();
  if (normalized.length === 0) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return rawText;
  }
}
