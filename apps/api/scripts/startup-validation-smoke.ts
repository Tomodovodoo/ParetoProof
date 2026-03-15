import { parseApiRuntimeEnv } from "../src/config/runtime.js";
import { buildServer } from "../src/server/build-server.js";

async function main() {
  const runtimeEnv = parseApiRuntimeEnv();
  const app = await buildServer(runtimeEnv);

  try {
    console.log(
      JSON.stringify({
        host: runtimeEnv.host,
        port: runtimeEnv.port,
        status: "api_startup_validation_passed"
      })
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
