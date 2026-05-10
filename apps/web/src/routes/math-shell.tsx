import { useMemo, useState } from "react";
import { AppIcon } from "../components/app-icon";
import {
  buildMathLaunchExportDataUrl,
  buildMathLaunchExportFilename,
  buildMathQuestionLaunchBootstrapResponse,
  buildMathQuestionLaunchRequest,
  defaultMathQuestion,
  mathLaunchPresets,
  resolveMathQuestionFromPath,
  type MathLaunchPreset
} from "../lib/math-launch";
import { buildMathUrl, buildPortalUrl } from "../lib/surface";

type MathShellProps = {
  email: string | null;
  pathname: string;
  roles: string[];
};

function describeMathPath(pathname: string) {
  if (pathname === "/submissions") {
    return {
      body:
        "Structured submission workflow belongs on the math surface, while profile, access, and operational evidence stay in the portal.",
      title: "Math submissions"
    };
  }

  if (pathname === "/reviews") {
    return {
      body:
        "Reviewer continuation now preserves the math host boundary. Durable review objects and actions remain follow-on work after this routing slice.",
      title: "Math reviews"
    };
  }

  return {
    body:
      "The dedicated math surface is now a real authenticated destination instead of collapsing back into the portal. Later issues will fill in the submission and review workflows that belong here.",
    title: "Math workspace"
  };
}

function canRequestHostedLaunch(roles: string[]) {
  return roles.includes("admin") || roles.includes("collaborator");
}

function getSelectedPreset(presetId: string): MathLaunchPreset {
  return (
    mathLaunchPresets.find((preset) => preset.id === presetId) ??
    mathLaunchPresets[0]
  );
}

function isQuestionLaunchPath(pathname: string) {
  return (
    pathname === "/launch" ||
    pathname === "/questions" ||
    pathname.startsWith("/questions/")
  );
}

export function MathShell({ email, pathname, roles }: MathShellProps) {
  const descriptor = describeMathPath(pathname);
  const roleLabel = roles[0] ?? "approved contributor";
  const question = resolveMathQuestionFromPath(pathname);
  const [presetId, setPresetId] = useState(mathLaunchPresets[0].id);
  const selectedPreset = getSelectedPreset(presetId);
  const hostedAllowed = canRequestHostedLaunch(roles);
  const launchCards = useMemo(() => {
    return (["hosted", "local_connected", "offline_export"] as const).map((mode) => {
      const request = buildMathQuestionLaunchRequest({
        mode,
        preset: selectedPreset,
        question
      });
      const response = buildMathQuestionLaunchBootstrapResponse(request);
      return { mode, request, response };
    });
  }, [question, selectedPreset]);

  if (isQuestionLaunchPath(pathname)) {
    return (
      <main className="auth-shell math-shell">
        <section className="math-launch-hero">
          <div className="math-launch-copy">
            <p className="eyebrow">
              <span className="inline-icon" aria-hidden="true">
                <AppIcon name="play" />
              </span>
              ParetoProof math
            </p>
            <h1>{pathname === "/questions" ? "Question launch catalog" : question.title}</h1>
            <p>{question.subtitle}</p>
            <p>
              Signed in{email ? ` as ${email}` : ""} with {roleLabel} access.
            </p>
          </div>
          <div className="math-question-summary" aria-label="Selected question">
            <span className="role-chip role-chip-tonal">Question</span>
            <strong>{question.questionId}</strong>
            <span>{question.benchmarkVersionId}</span>
            <a className="portal-inline-link" href={question.statementHref}>
              Open statement source
            </a>
          </div>
        </section>

        <section className="math-launch-panel" aria-labelledby="math-launch-title">
          <div className="portal-panel-header">
            <div>
              <p className="section-tag">Launch preset</p>
              <h2 id="math-launch-title">Choose the run shape once, then inspect each launch path.</h2>
            </div>
            <span className="role-chip role-chip-muted">single_run</span>
          </div>
          <div className="portal-form-grid math-preset-grid">
            <label className="portal-field">
              <span>Preset</span>
              <select
                className="input"
                onChange={(event) => {
                  setPresetId(event.target.value);
                }}
                value={presetId}
              >
                {mathLaunchPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <article className="portal-results-contract-card math-preset-card">
              <p className="section-tag">Harness options</p>
              <h3>{selectedPreset.label}</h3>
              <p>{selectedPreset.summary}</p>
              <p>
                {selectedPreset.runMode} / {selectedPreset.toolProfile}
              </p>
            </article>
            <article className="portal-results-contract-card math-preset-card">
              <p className="section-tag">Boundary</p>
              <h3>No browser secrets</h3>
              <p>
                Hosted uses platform-managed credentials; local credentials stay on the runner host;
                offline export carries no provider credential.
              </p>
            </article>
          </div>
        </section>

        <section className="math-launch-card-grid" aria-label="Question launch paths">
          {launchCards.map(({ mode, request, response }) => {
            const exportHref = buildMathLaunchExportDataUrl(response);
            const exportName = buildMathLaunchExportFilename(request.question.questionId);
            const title =
              mode === "hosted"
                ? "Hosted run"
                : mode === "local_connected"
                  ? "Local connected"
                  : "Offline export";
            const cardCopy =
              mode === "hosted"
                ? "Submit through the managed worker pool once the math launch mutation lands."
                : mode === "local_connected"
                  ? "Bootstrap a trusted local runner without moving user credentials into the browser."
                  : "Download a descriptor for offline package materialization and later ingest.";
            const statusCopy =
              mode === "hosted"
                ? hostedAllowed
                  ? "Backend contract pending"
                  : "Collaborator access required"
                : mode === "local_connected"
                  ? "Bootstrap descriptor ready"
                  : "Export descriptor ready";

            return (
              <article className="math-launch-card" key={mode}>
                <div className="math-launch-card-head">
                  <span className="site-panel-mark" aria-hidden="true">
                    <AppIcon
                      name={
                        mode === "hosted"
                          ? "server"
                          : mode === "local_connected"
                            ? "key"
                            : "flask"
                      }
                    />
                  </span>
                  <div>
                    <p className="section-tag">{statusCopy}</p>
                    <h2>{title}</h2>
                  </div>
                </div>
                <p>{cardCopy}</p>
                <dl className="math-launch-facts">
                  <div>
                    <dt>Model</dt>
                    <dd>{request.modelConfigId}</dd>
                  </div>
                  <div>
                    <dt>Credential</dt>
                    <dd>{request.credentialPolicy.replace(/_/g, " ")}</dd>
                  </div>
                  <div>
                    <dt>Harness</dt>
                    <dd>{request.harness.harnessId}</dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{request.harness.runtimeClass.replace(/_/g, " ")}</dd>
                  </div>
                </dl>
                {response.mode === "local_connected" ? (
                  <div className="math-command-block">
                    <span>{response.bootstrap.runnerCommand.label}</span>
                    <code>{response.bootstrap.runnerCommand.command.join(" ")}</code>
                  </div>
                ) : null}
                {response.mode === "hosted" ? (
                  <p className="math-launch-note">
                    Posts to {response.endpoint} and redirects to {response.redirectPattern} after
                    durable run creation.
                  </p>
                ) : null}
                {exportHref ? (
                  <a className="button" download={exportName} href={exportHref}>
                    Download descriptor
                  </a>
                ) : (
                  <button className="button button-secondary" disabled type="button">
                    {mode === "hosted" ? "Launch pending" : "Bootstrap pending"}
                  </button>
                )}
              </article>
            );
          })}
        </section>

        <nav className="math-launch-footer" aria-label="Math launch links">
          <a className="button button-secondary" href={buildMathUrl("/")}>
            Math home
          </a>
          <a className="button button-secondary" href={buildPortalUrl("/runs")}>
            Open run evidence
          </a>
        </nav>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-polished auth-status-card">
        <p className="eyebrow">
          <span className="inline-icon" aria-hidden="true">
            <AppIcon name="shield" />
          </span>
          ParetoProof math
        </p>
        <h1>{descriptor.title}</h1>
        <p>{descriptor.body}</p>
        <p>
          Signed in
          {email ? ` as ${email}` : ""} with {roleLabel} access.
        </p>
        <div className="auth-card-footer">
          <a className="button" href={buildMathUrl("/")}>
            Math home
          </a>
          <a
            className="button button-secondary"
            href={buildMathUrl(`/questions/${encodeURIComponent(defaultMathQuestion.questionId)}`)}
          >
            Open Problem 9 launch
          </a>
          <a className="button button-secondary" href={buildPortalUrl("/profile")}>
            Open portal profile
          </a>
          <a className="button button-secondary" href={buildPortalUrl("/runs")}>
            Open run evidence
          </a>
        </div>
      </section>
    </main>
  );
}
