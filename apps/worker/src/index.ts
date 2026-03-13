import { runProblem9PackageCli } from "./lib/problem9-package-cli.js";
import { runProblem9PromptPackageCli } from "./lib/problem9-prompt-package-cli.js";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error(
    [
      "Usage:",
      "  tsx src/index.ts materialize-problem9-package --output <directory>",
      "  tsx src/index.ts materialize-problem9-prompt-package --output <directory> --benchmark-package-root <directory> --run-id <id> --attempt-id <id> --lane-id <id> --run-mode <mode> --tool-profile <profile> --provider-family <family> --auth-mode <mode> --model-config-id <id> --harness-revision <revision>"
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
} else {
  console.error(`Unknown worker command: ${command}`);
  process.exitCode = 1;
}
