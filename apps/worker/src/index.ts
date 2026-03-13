import { runProblem9PackageCli } from "./lib/problem9-package-cli.js";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error(
    "Usage: tsx src/index.ts materialize-problem9-package --output <directory>"
  );
  process.exitCode = 1;
} else if (command === "materialize-problem9-package") {
  void runProblem9PackageCli(args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
} else {
  console.error(`Unknown worker command: ${command}`);
  process.exitCode = 1;
}
