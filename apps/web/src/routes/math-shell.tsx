import { AppIcon } from "../components/app-icon";
import { buildMathUrl, buildPortalUrl } from "../lib/surface";

type MathShellProps = {
  email: string | null;
  pathname: string;
  roles: string[];
};

function describeMathPath(pathname: string) {
  if (pathname === "/launch") {
    return {
      body:
        "Question-centric launch now resolves onto the dedicated math surface. Execution evidence, worker posture, and admin controls still stay in the portal until later math product slices land.",
      title: "Math launch entry"
    };
  }

  if (pathname.startsWith("/questions/")) {
    return {
      body:
        "Question-specific continuation now lands on the math host instead of collapsing back into the portal. Deeper question objects and review state land in later scopes.",
      title: "Math question workflow"
    };
  }

  if (pathname === "/questions") {
    return {
      body:
        "The dedicated math workflow now has its own authenticated surface. Question catalog, submission, and review objects still arrive in later child scopes.",
      title: "Math question catalog"
    };
  }

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
      "The dedicated math surface is now a real authenticated destination instead of collapsing back into the portal. Later issues will fill in the question, submission, and review workflows that belong here.",
    title: "Math workspace"
  };
}

export function MathShell({ email, pathname, roles }: MathShellProps) {
  const descriptor = describeMathPath(pathname);
  const roleLabel = roles[0] ?? "approved contributor";

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
