import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapWebApp } from "./bootstrap-app.tsx";

test("bootstrapWebApp renders the React app after startup dependencies load", async () => {
  let renderCalls = 0;
  let runtimeEnvReads = 0;
  const rootElement = { innerHTML: "" };

  const result = await bootstrapWebApp(rootElement, {
    createRoot() {
      return {
        render() {
          renderCalls += 1;
        }
      };
    },
    loadApp: async () => ({
      default: () => null
    }),
    loadRuntimeEnv: async () => ({
      readWebRuntimeEnv() {
        runtimeEnvReads += 1;
        return {};
      }
    }),
    loadStyles: async () => ({})
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(renderCalls, 1);
  assert.equal(runtimeEnvReads, 1);
  assert.equal(rootElement.innerHTML, "");
});

test("bootstrapWebApp falls back to the startup error shell when startup throws", async () => {
  const observedErrors = [];
  const rootElement = { innerHTML: "" };

  const result = await bootstrapWebApp(rootElement, {
    createRoot() {
      return {
        render() {
          throw new Error("render should not be reached");
        }
      };
    },
    loadApp: async () => {
      throw new Error("Invalid web runtime environment: VITE_API_BASE_URL");
    },
    loadRuntimeEnv: async () => ({
      readWebRuntimeEnv() {
        return {};
      }
    }),
    loadStyles: async () => ({}),
    logger: {
      error(error) {
        observedErrors.push(error);
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(observedErrors.length, 1);
  assert.match(rootElement.innerHTML, /ParetoProof could not start\./);
  assert.match(
    rootElement.innerHTML,
    /Invalid web runtime environment: VITE_API_BASE_URL/
  );
});
