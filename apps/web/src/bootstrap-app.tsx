import React from "react";
import ReactDOM from "react-dom/client";
import { buildStartupFailureShellMarkup } from "./lib/startup-shell";

type AppComponent = () => React.ReactElement;

type BootstrapDependencies = {
  createRoot?: typeof ReactDOM.createRoot;
  loadApp?: () => Promise<{ default: AppComponent }>;
  loadRuntimeEnv?: () => Promise<{ readWebRuntimeEnv: () => unknown }>;
  loadStyles?: () => Promise<unknown>;
  logger?: Pick<Console, "error">;
};

export async function bootstrapWebApp(
  rootElement: HTMLElement,
  dependencies: BootstrapDependencies = {}
) {
  const createRoot = dependencies.createRoot ?? ReactDOM.createRoot;
  const loadApp = dependencies.loadApp ?? (() => import("./App"));
  const loadRuntimeEnv =
    dependencies.loadRuntimeEnv ?? (() => import("./lib/runtime-env"));
  const loadStyles = dependencies.loadStyles ?? (() => import("./styles/app.css"));
  const logger = dependencies.logger ?? console;

  try {
    const [{ default: App }, { readWebRuntimeEnv }] = await Promise.all([
      loadApp(),
      loadRuntimeEnv(),
      loadStyles()
    ]);

    readWebRuntimeEnv();

    createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    return { ok: true } as const;
  } catch (error) {
    logger.error(error);
    rootElement.innerHTML = buildStartupFailureShellMarkup(error);

    return {
      error,
      ok: false
    } as const;
  }
}
