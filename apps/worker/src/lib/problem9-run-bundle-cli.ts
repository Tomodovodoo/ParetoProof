import path from "node:path";
import { materializeProblem9RunBundle } from "./problem9-run-bundle.js";

function parseBooleanFlag(rawValue: string, flag: string): boolean {
  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  throw new Error(`${flag} must be either true or false.`);
}

export async function runProblem9RunBundleCli(args: string[]): Promise<void> {
  const getRequiredValue = (flag: string): string => {
    const index = args.findIndex((argument) => argument === flag);

    if (index === -1 || !args[index + 1]) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return args[index + 1];
  };

  const getOptionalValue = (flag: string): string | null => {
    const index = args.findIndex((argument) => argument === flag);
    return index === -1 || !args[index + 1] ? null : args[index + 1];
  };

  const failureClassificationPath = getOptionalValue("--failure-classification");
  const result = await materializeProblem9RunBundle({
    axiomCheck: getRequiredValue("--axiom-check") as
      | "passed"
      | "failed"
      | "not_evaluated",
    benchmarkPackageRoot: path.resolve(getRequiredValue("--benchmark-package-root")),
    candidateSourcePath: path.resolve(getRequiredValue("--candidate-source")),
    compilerDiagnosticsPath: path.resolve(getRequiredValue("--compiler-diagnostics")),
    compilerOutputPath: path.resolve(getRequiredValue("--compiler-output")),
    containsAdmit: parseBooleanFlag(getRequiredValue("--contains-admit"), "--contains-admit"),
    containsSorry: parseBooleanFlag(getRequiredValue("--contains-sorry"), "--contains-sorry"),
    diagnosticGate: getRequiredValue("--diagnostic-gate") as "passed" | "failed",
    environmentInputPath: path.resolve(getRequiredValue("--environment-input")),
    failureClassificationPath:
      failureClassificationPath === null ? null : path.resolve(failureClassificationPath),
    outputRoot: path.resolve(getRequiredValue("--output")),
    promptPackageRoot: path.resolve(getRequiredValue("--prompt-package-root")),
    result: getRequiredValue("--result") as "pass" | "fail",
    semanticEquality: getRequiredValue("--semantic-equality") as
      | "matched"
      | "mismatched"
      | "not_evaluated",
    stopReason: getRequiredValue("--stop-reason"),
    surfaceEquality: getRequiredValue("--surface-equality") as
      | "matched"
      | "drifted"
      | "not_evaluated",
    verifierOutputPath: path.resolve(getRequiredValue("--verifier-output"))
  });

  console.log(
    JSON.stringify(
      {
        artifactManifestDigest: result.artifactManifestDigest,
        bundleDigest: result.bundleDigest,
        candidateDigest: result.candidateDigest,
        environmentDigest: result.environmentDigest,
        outputRoot: result.outputRoot,
        promptPackageDigest: result.promptPackageDigest,
        runConfigDigest: result.runConfigDigest,
        verdictDigest: result.verdictDigest
      },
      null,
      2
    )
  );
}
