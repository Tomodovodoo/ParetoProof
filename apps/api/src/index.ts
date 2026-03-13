import { parseApiRuntimeEnv } from "./config/runtime.js";
import { buildServer } from "./server/build-server.js";

const start = async () => {
  const runtimeEnv = parseApiRuntimeEnv();
  const app = await buildServer(runtimeEnv);

  try {
    await app.listen({ host: runtimeEnv.host, port: runtimeEnv.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  void start();
}
