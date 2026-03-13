import { runProblem9AttemptCli } from "./lib/problem9-attempt-cli.js";
import { runProblem9OfflineIngestCli } from "./lib/problem9-offline-ingest-cli.js";
import { runProblem9AttemptInDevboxCli } from "./lib/problem9-attempt-devbox-cli.js";
import { runProblem9PackageCli } from "./lib/problem9-package-cli.js";
import { runProblem9PromptPackageCli } from "./lib/problem9-prompt-package-cli.js";
import { runProblem9RunBundleCli } from "./lib/problem9-run-bundle-cli.js";
import { runWorkerClaimLoopCli } from "./lib/worker-claim-loop-cli.js";

const [command, ...args] = process.argv.slice(2);
const showWorkerUsage = () => {
  console.error(
    [
      "Usage:",
      "  tsx src/index.ts materialize-problem9-package --output <directory>",
      "  tsx src/index.ts materialize-problem9-prompt-package --output <directory> --benchmark-package-root <directory> --run-id <id> --attempt-id <id> --lane-id <id> --run-mode <mode> --tool-profile <profile> --provider-family <family> --auth-mode <mode> --model-config-id <id> --harness-revision <revision>",
      "  tsx src/index.ts materialize-problem9-run-bundle --output <directory> --benchmark-package-root <directory> --prompt-package-root <directory> --candidate-source <file> --compiler-diagnostics <file> --compiler-output <file> --verifier-output <file> --environment-input <file> --result <pass|fail> --semantic-equality <matched|mismatched|not_evaluated> --surface-equality <matched|drifted|not_evaluated> --contains-sorry <true|false> --contains-admit <true|false> --axiom-check <passed|failed|not_evaluated> --diagnostic-gate <passed|failed> --stop-reason <reason> [--failure-classification <file>]",
      "  tsx src/index.ts run-problem9-attempt --benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> [--provider-family <family>] [--auth-mode <mode>] [--provider-model <model>] [--model-snapshot-id <id>] [--stub-scenario exact_canonical|compile_failure]",
      "  tsx src/index.ts run-problem9-attempt-in-devbox --image <docker-image> [--preflight-only] [--print-docker-command] [--benchmark-package-root <directory> --prompt-package-root <directory> --workspace <directory> --output <directory> --provider-model <model>]",
      "  tsx src/index.ts ingest-problem9-run-bundle --bundle-root <directory> --access-jwt <token>",
      "  tsx src/index.ts run-worker-claim-loop --worker-id <id> --worker-pool <pool> --worker-version <version> --workspace-root <directory> --output-root <directory> [--auth-mode machine_api_key|machine_oauth] [--worker-runtime modal|local_docker] [--provider-model <model>] [--max-jobs <count>] [--once]"
    ].join("\n")
  );
};

if (!command || command === "--help") {
  showWorkerUsage();
  process.exitCode = command === "--help" ? 0 : 1;
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
} else if (command === "run-problem9-attempt") {
  void runProblem9AttemptCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else if (command === "run-problem9-attempt-in-devbox") {
  void runProblem9AttemptInDevboxCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else if (command === "ingest-problem9-run-bundle") {
  void runProblem9OfflineIngestCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else if (command === "run-worker-claim-loop") {
  void runWorkerClaimLoopCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else {
  console.error(`Unknown worker command: ${command}`);
  process.exitCode = 1;
}
