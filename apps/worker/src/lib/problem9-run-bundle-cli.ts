import path from "node:path";
import { readWorkerCliFlagValue, WorkerCliError } from "./cli-contract.js";
import { materializeProblem9RunBundle } from "./problem9-run-bundle.js";
import { parseWorkerRuntimeEnv } from "./runtime.js";

const deprecatedTruthFlags = [
  "--axiom-check",
  "--contains-admit",
  "--contains-sorry",
  "--diagnostic-gate",
  "--result",
  "--semantic-equality",
  "--stop-reason",
  "--surface-equality"
] as const;

export async function runProblem9RunBundleCli(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.error(
      "Usage: tsx src/index.ts materialize-problem9-run-bundle --output <directory> --benchmark-package-root <directory> --prompt-package-root <directory> --candidate-source <file> --compiler-diagnostics <file> --compiler-output <file> --verifier-output <file> --environment-input <file> [--failure-classification <file>]"
    );
    return;
  }

  await parseWorkerRuntimeEnv({
    commandFamily: "materializer"
  });

  const usedDeprecatedTruthFlags = [...new Set(args.filter((argument) => deprecatedTruthFlags.includes(argument as (typeof deprecatedTruthFlags)[number])))];

  if (usedDeprecatedTruthFlags.length > 0) {
    throw new WorkerCliError(
      "validation",
      `Canonical run-bundle truth is now derived from bundled verifier artifacts; remove ${usedDeprecatedTruthFlags.join(", ")}.`
    );
  }

  const getRequiredValue = (flag: string): string => {
    const { value } = readWorkerCliFlagValue(args, flag);

    if (value === null) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return value;
  };

  const getOptionalValue = (flag: string): string | null => {
    const { present, value } = readWorkerCliFlagValue(args, flag);

    if (!present) {
      return null;
    }

    if (value === null) {
      throw new Error(`Missing ${flag} <value> argument.`);
    }

    return value;
  };

  const failureClassificationPath = getOptionalValue("--failure-classification");
  const result = await materializeProblem9RunBundle({
    benchmarkPackageRoot: path.resolve(getRequiredValue("--benchmark-package-root")),
    candidateSourcePath: path.resolve(getRequiredValue("--candidate-source")),
    compilerDiagnosticsPath: path.resolve(getRequiredValue("--compiler-diagnostics")),
    compilerOutputPath: path.resolve(getRequiredValue("--compiler-output")),
    environmentInputPath: path.resolve(getRequiredValue("--environment-input")),
    failureClassificationPath:
      failureClassificationPath === null ? null : path.resolve(failureClassificationPath),
    outputRoot: path.resolve(getRequiredValue("--output")),
    promptPackageRoot: path.resolve(getRequiredValue("--prompt-package-root")),
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
