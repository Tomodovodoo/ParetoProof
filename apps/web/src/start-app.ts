function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildFatalStartupShellMarkup(error: unknown) {
  const detail =
    error instanceof Error && error.message.trim().length > 0
      ? `The app could not finish starting. Refresh and try again. ${error.message.trim()}`
      : "The app could not finish starting. Refresh and try again.";

  return [
    '<main data-startup-shell aria-live="assertive">',
    '  <section data-startup-shell-card>',
    '    <p data-startup-shell-eyebrow>ParetoProof</p>',
    '    <h1 data-startup-shell-title>ParetoProof could not start.</h1>',
    `    <p data-startup-shell-body>${escapeHtml(detail)}</p>`,
    "  </section>",
    "</main>"
  ].join("");
}

type StartAppDependencies = {
  loadBootstrapApp?: () => Promise<{
    bootstrapWebApp: (rootElement: HTMLElement) => Promise<{ ok: boolean }>;
  }>;
  logger?: Pick<Console, "error">;
};

export async function startParetoProof(
  rootElement: HTMLElement,
  dependencies: StartAppDependencies = {}
) {
  const loadBootstrapApp =
    dependencies.loadBootstrapApp ?? (() => import("./bootstrap-app"));
  const logger = dependencies.logger ?? console;

  try {
    const { bootstrapWebApp } = await loadBootstrapApp();
    return await bootstrapWebApp(rootElement);
  } catch (error) {
    logger.error(error);
    rootElement.innerHTML = buildFatalStartupShellMarkup(error);

    return {
      error,
      ok: false
    } as const;
  }
}
