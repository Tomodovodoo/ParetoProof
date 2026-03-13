import { preflightProblem9AuthMode } from "./problem9-auth.js";

export async function runProblem9AuthPreflightCli(args: string[]): Promise<void> {
  const getRequiredValue = (flag: string): string => {
    const index = args.findIndex((argument) => argument === flag);

    if (index === -1 || !args[index + 1]) {
      throw new Error(`Missing required ${flag} <value> argument.`);
    }

    return args[index + 1];
  };

  const getOptionalValue = (flag: string): string | undefined => {
    const index = args.findIndex((argument) => argument === flag);
    return index === -1 || !args[index + 1] ? undefined : args[index + 1];
  };

  const result = await preflightProblem9AuthMode(
    getRequiredValue("--auth-mode") as
      | "trusted_local_user"
      | "machine_api_key"
      | "machine_oauth"
      | "local_stub",
    {
      expectedCodexHome: getOptionalValue("--expect-codex-home")
    }
  );

  console.log(JSON.stringify(result, null, 2));
}
