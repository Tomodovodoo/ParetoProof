import { buildAccessStartUrl, buildPublicUrl, isLocalHostname } from "../lib/surface";

type AuthEntryProps = {
  redirectPath: string;
};

export function AuthEntry({ redirectPath }: AuthEntryProps) {
  const githubStartUrl = buildAccessStartUrl("github", redirectPath);
  const googleStartUrl = buildAccessStartUrl("google", redirectPath);
  const isLocal = isLocalHostname(window.location.hostname.toLowerCase());

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-polished">
        <div className="auth-card-intro">
          <p className="eyebrow">ParetoProof Portal</p>
          <h1>Sign in to the contributor workspace.</h1>
          <p className="auth-lead">
            Access stays behind Cloudflare Access. Use a trusted provider to
            continue into the portal and let the backend decide your approval
            level.
          </p>
        </div>

        <div className="auth-provider-list">
          <a className="auth-provider-button" href={githubStartUrl}>
            <span className="auth-provider-mark" aria-hidden="true">
              GH
            </span>
            <span>
              <strong>Continue with GitHub</strong>
              <small>Use your GitHub identity for portal access.</small>
            </span>
          </a>
          <a className="auth-provider-button" href={googleStartUrl}>
            <span className="auth-provider-mark" aria-hidden="true">
              GO
            </span>
            <span>
              <strong>Continue with Google</strong>
              <small>Use your Google account for the same portal flow.</small>
            </span>
          </a>
        </div>

        <div className="auth-card-footer">
          <p>
            {isLocal
              ? "Local development bypasses Cloudflare Access and opens a fully approved portal session."
              : "If you have not been approved yet, sign in first and submit an access request from inside the portal."}
          </p>
          <a className="button button-secondary" href={buildPublicUrl("/")}>
            Back to paretoproof.com
          </a>
        </div>
      </section>
    </main>
  );
}
