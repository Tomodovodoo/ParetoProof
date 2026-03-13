import path from "node:path";
import { materializeProblem9RunBundle } from "./problem9-run-bundle.js";

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

  const parseBooleanFlag = (flag: string): boolean => {
    const value = getRequiredValue(flag);

    if (value !== "true" && value !== "false") {
      throw new Error(`${flag} must be either true or false.`);
    }

    return value === "true";
  };

  const result = await materializeProblem9RunBundle({
    axiomCheck: getRequiredValue("--axiom-check") as "pass" | "fail",
    benchmarkPackageRoot: path.resolve(getRequiredValue("--benchmark-package-root")),
    candidateSourcePath: path.resolve(getRequiredValue("--candidate-source")),
    compilerDiagnosticsPath: path.resolve(getRequiredValue("--compiler-diagnostics")),
    compilerOutputPath: path.resolve(getRequiredValue("--compiler-output")),
    containsAdmit: parseBooleanFlag("--contains-admit"),
    containsSorry: parseBooleanFlag("--contains-sorry"),
    diagnosticGate: getRequiredValue("--diagnostic-gate") as "pass" | "fail",
    environmentInputPath: path.resolve(getRequiredValue("--environment-input")),
    failureCode: getOptionalValue("--failure-code"),
    outputRoot: path.resolve(getRequiredValue("--output")),
    promptPackageRoot: path.resolve(getRequiredValue("--prompt-package-root")),
    result: getRequiredValue("--result") as "pass" | "fail",
    semanticEquality: getRequiredValue("--semantic-equality") as "pass" | "fail",
    status: getRequiredValue("--status") as "success" | "failure" | "incomplete",
    stopReason: getRequiredValue("--stop-reason"),
    surfaceDrift: parseBooleanFlag("--surface-drift"),
    surfaceEquality: getRequiredValue("--surface-equality") as "pass" | "fail",
    verifierOutputPath: path.resolve(getRequiredValue("--verifier-output"))
  });

  console.log(
    JSON.stringify(
      {
        outputRoot: result.outputRoot,
        bundleDigest: result.bundleDigest
      },
      null,
      2
    )
  );
}
