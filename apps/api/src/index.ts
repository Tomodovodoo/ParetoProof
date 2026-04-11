import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiRuntimeEnv } from "./config/runtime.js";
import { buildServer } from "./server/build-server.js";

export async function startApiServer(options?: {
  buildApiServer?: typeof buildServer;
  exit?: (code: number) => void;
  parseRuntimeEnv?: typeof parseApiRuntimeEnv;
}) {
  let app: Awaited<ReturnType<typeof buildServer>> | null = null;

  try {
    const runtimeEnv = (options?.parseRuntimeEnv ?? parseApiRuntimeEnv)();
    app = await (options?.buildApiServer ?? buildServer)(runtimeEnv);
    await app.listen({ host: runtimeEnv.host, port: runtimeEnv.port });
  } catch (error) {
    if (app) {
      app.log.error(error);
    } else {
      console.error(error);
    }
    (options?.exit ?? process.exit)(1);
  }
}

export function isExecutedAsMainModule(options?: {
  entryPointPath?: string;
  moduleUrl?: string;
}) {
  const entryPointPath = options?.entryPointPath ?? process.argv[1];

  if (!entryPointPath) {
    return false;
  }

  return (
    resolve(fileURLToPath(options?.moduleUrl ?? import.meta.url)) ===
    resolve(entryPointPath)
  );
}

if (process.env.NODE_ENV !== "test" && isExecutedAsMainModule()) {
  void startApiServer();
}
