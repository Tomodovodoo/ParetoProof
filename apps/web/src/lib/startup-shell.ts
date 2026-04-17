function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatStartupFailureDetail(error: unknown) {
  if (!(error instanceof Error)) {
    return "The app could not finish starting. Refresh and try again.";
  }

  const message = error.message.trim();

  if (message.length === 0) {
    return "The app could not finish starting. Refresh and try again.";
  }

  return `The app could not finish starting. Refresh and try again. ${message}`;
}

export function buildStartupFailureShellMarkup(error: unknown) {
  return [
    '<main data-startup-shell aria-live="assertive">',
    '  <section data-startup-shell-card>',
    '    <p data-startup-shell-eyebrow>ParetoProof</p>',
    '    <h1 data-startup-shell-title> ParetoProof could not start. </h1>',
    `    <p data-startup-shell-body>${escapeHtml(formatStartupFailureDetail(error))}</p>`,
    "  </section>",
    "</main>"
  ].join("");
}
