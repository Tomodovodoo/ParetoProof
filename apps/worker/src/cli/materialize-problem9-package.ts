import path from "node:path";

import { materializeProblem9Package } from "../lib/problem9-package-materializer.js";

function parseOutputDir(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --output.");
      }
      return value;
    }

    if (argument.startsWith("--output=")) {
      const value = argument.slice("--output=".length);
      if (!value) {
        throw new Error("Missing value for --output.");
      }
      return value;
    }
  }

  throw new Error("Missing required --output <directory> argument.");
}

async function main(): Promise<void> {
  const outputDir = parseOutputDir(process.argv.slice(2));
  const result = await materializeProblem9Package({ outputDir });

  process.stdout.write(
    `${JSON.stringify(
      {
        materializedRoot: path.normalize(result.materializedRoot),
        benchmarkManifestDigest: result.benchmarkManifestDigest,
        packageDigest: result.packageDigest,
        filesHashed: Object.keys(result.hashes),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
