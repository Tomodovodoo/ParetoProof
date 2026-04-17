import assert from "node:assert/strict";
import test from "node:test";
import { startParetoProof } from "./start-app.ts";

test("startParetoProof delegates to the bootstrap module on success", async () => {
  const rootElement = { innerHTML: "" };
  let bootstrapCalls = 0;

  const result = await startParetoProof(rootElement, {
    loadBootstrapApp: async () => ({
      async bootstrapWebApp() {
        bootstrapCalls += 1;
        return { ok: true };
      }
    })
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(bootstrapCalls, 1);
  assert.equal(rootElement.innerHTML, "");
});

test("startParetoProof shows a visible startup error shell when the bootstrap module fails to load", async () => {
  const rootElement = { innerHTML: "" };
  const observedErrors = [];

  const result = await startParetoProof(rootElement, {
    loadBootstrapApp: async () => {
      throw new Error("bootstrap module failed");
    },
    logger: {
      error(error) {
        observedErrors.push(error);
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(observedErrors.length, 1);
  assert.match(rootElement.innerHTML, /ParetoProof could not start\./);
  assert.match(rootElement.innerHTML, /bootstrap module failed/);
});
