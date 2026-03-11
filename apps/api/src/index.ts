import { assertApiRuntimeEnv } from "./config/runtime.js";
import { buildServer } from "./server/build-server.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
  assertApiRuntimeEnv();
  const app = await buildServer();

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  void start();
}
