import { runProblem9PackageCli } from "./lib/problem9-package-cli.js";
import { runProblem9PromptPackageCli } from "./lib/problem9-prompt-package-cli.js";
import { runProblem9RunBundleCli } from "./lib/problem9-run-bundle-cli.js";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error(
    [
      "Usage:",
      "  tsx src/index.ts materialize-problem9-package --output <directory>",
      "  tsx src/index.ts materialize-problem9-prompt-package --output <directory> --benchmark-package-root <directory> --run-id <id> --attempt-id <id> --lane-id <id> --run-mode <mode> --tool-profile <profile> --provider-family <family> --auth-mode <mode> --model-config-id <id> --harness-revision <revision>",
      "  tsx src/index.ts materialize-problem9-run-bundle --output <directory> --benchmark-package-root <directory> --prompt-package-root <directory> --candidate-source <file> --compiler-diagnostics <file> --compiler-output <file> --verifier-output <file> --environment-input <file> --result <pass|fail> --semantic-equality <matched|mismatched|not_evaluated> --surface-equality <matched|drifted|not_evaluated> --contains-sorry <true|false> --contains-admit <true|false> --axiom-check <passed|failed|not_evaluated> --diagnostic-gate <passed|failed> --stop-reason <reason> [--failure-classification <file>]"
    ].join("\n")
  );
  process.exitCode = 1;
} else if (command === "materialize-problem9-package") {
  void runProblem9PackageCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else if (command === "materialize-problem9-prompt-package") {
  void runProblem9PromptPackageCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else if (command === "materialize-problem9-run-bundle") {
  void runProblem9RunBundleCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else {
  console.error(`Unknown worker command: ${command}`);
  process.exitCode = 1;
}
