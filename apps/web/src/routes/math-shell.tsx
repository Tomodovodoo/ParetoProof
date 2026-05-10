import { findAppRouteBySurface } from "@paretoproof/shared";

import { AppIcon, type AppIconName } from "../components/app-icon";
import { buildMathUrl, buildPortalUrl } from "../lib/surface";

type MathShellProps = {
  email: string | null;
  pathname: string;
  roles: string[];
};

type MathNavItem = {
  icon: AppIconName;
  label: string;
  path: string;
  routeIds: string[];
};

const mathNavItems: MathNavItem[] = [
  {
    icon: "grid",
    label: "Home",
    path: "/",
    routeIds: ["math.home"]
  },
  {
    icon: "compass",
    label: "Questions",
    path: "/questions",
    routeIds: ["math.questions", "math.question-detail"]
  },
  {
    icon: "flask",
    label: "Submissions",
    path: "/submissions",
    routeIds: ["math.submissions"]
  },
  {
    icon: "users",
    label: "Reviews",
    path: "/reviews",
    routeIds: ["math.reviews"]
  },
  {
    icon: "play",
    label: "Launch",
    path: "/launch",
    routeIds: ["math.launch"]
  }
];

function readQuestionId(pathname: string) {
  const [, basePath, questionId] = pathname.split("/");

  if (basePath !== "questions" || !questionId) {
    return null;
  }

  try {
    return decodeURIComponent(questionId);
  } catch {
    return questionId;
  }
}

export function describeMathPath(pathname: string) {
  const route = findAppRouteBySurface("math", pathname);

  if (route?.id === "math.launch") {
    return {
      body:
        "Question-centric launch now resolves onto the dedicated math surface. Execution evidence, worker posture, and admin controls still stay in the portal until later math product slices land.",
      eyebrow: "Launch",
      title: "Math launch entry"
    };
  }

  if (route?.id === "math.question-detail") {
    const questionId = readQuestionId(pathname);

    return {
      body:
        questionId === null
          ? "Question-specific continuation now lands on the math host instead of collapsing back into the portal. Deeper question objects and review state land in later scopes."
          : `Question-specific continuation for ${questionId} now lands on the math host instead of collapsing back into the portal. Deeper question objects and review state land in later scopes.`,
      eyebrow: "Question workflow",
      title: "Math question workflow"
    };
  }

  if (route?.id === "math.questions") {
    return {
      body:
        "The dedicated math workflow now has its own authenticated surface. Question catalog, submission, and review objects still arrive in later child scopes.",
      eyebrow: "Catalog",
      title: "Math question catalog"
    };
  }

  if (route?.id === "math.submissions") {
    return {
      body:
        "Structured submission workflow belongs on the math surface, while profile, access, and operational evidence stay in the portal.",
      eyebrow: "Submission workflow",
      title: "Math submissions"
    };
  }

  if (route?.id === "math.reviews") {
    return {
      body:
        "Reviewer continuation now preserves the math host boundary. Durable review objects and actions remain follow-on work after this routing slice.",
      eyebrow: "Review workflow",
      title: "Math reviews"
    };
  }

  return {
    body:
      "The dedicated math surface is now a real authenticated destination instead of collapsing back into the portal. Later issues will fill in the question, submission, and review workflows that belong here.",
    eyebrow: "Workspace",
    title: "Math workspace"
  };
}

function getActiveMathPath(pathname: string) {
  const route = findAppRouteBySurface("math", pathname);
  const matchingItem = mathNavItems.find((item) => route && item.routeIds.includes(route.id));

  return matchingItem?.path ?? "/";
}

export function MathShell({ email, pathname, roles }: MathShellProps) {
  const descriptor = describeMathPath(pathname);
  const activePath = getActiveMathPath(pathname);
  const roleLabel = roles[0] ?? "approved contributor";
  const signedInLabel = email ? `Signed in as ${email}` : "Signed in";

  return (
    <main className="math-shell">
      <header className="math-shell-header">
        <div className="math-shell-brand">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="shield" />
            </span>
            ParetoProof math
          </p>
          <h1>Math workspace</h1>
        </div>
        <div className="math-shell-identity" aria-label="Current account">
          <span>{signedInLabel}</span>
          <strong>{roleLabel}</strong>
        </div>
      </header>

      <nav className="math-shell-nav" aria-label="Math workspace">
        {mathNavItems.map((item) => {
          const isActive = item.path === activePath;

          return (
            <a
              key={item.path}
              className="math-shell-nav-link"
              href={buildMathUrl(item.path)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="inline-icon" aria-hidden="true">
                <AppIcon name={item.icon} />
              </span>
              <span className="math-shell-nav-label">{item.label}</span>
            </a>
          );
        })}
      </nav>

      <section className="math-shell-content" aria-labelledby="math-shell-heading">
        <article className="math-shell-panel">
          <p className="section-tag">{descriptor.eyebrow}</p>
          <h2 id="math-shell-heading">{descriptor.title}</h2>
          <p>{descriptor.body}</p>

          <div className="math-shell-status-list" aria-label="Surface boundaries">
            <div>
              <span>Current route</span>
              <strong>{pathname}</strong>
            </div>
            <div>
              <span>Authenticated surface</span>
              <strong>math.paretoproof.com</strong>
            </div>
            <div>
              <span>Portal handoff</span>
              <strong>profile and evidence links</strong>
            </div>
          </div>

          <div className="math-shell-actions">
            <a className="button" href={buildMathUrl(pathname)}>
              Stay on math surface
            </a>
            <a className="button button-secondary" href={buildPortalUrl("/profile")}>
              Open portal profile
            </a>
            <a className="button button-secondary" href={buildPortalUrl("/runs")}>
              Open run evidence
            </a>
          </div>
        </article>

        <aside className="math-shell-side-panel" aria-label="Math surface scope">
          <p className="section-tag">Scope</p>
          <h2>Question work lives here</h2>
          <p>
            The shell keeps math continuation on the math host while later slices add durable
            question, submission, and review data.
          </p>
          <a className="math-shell-side-link" href={buildPortalUrl("/")}>
            Portal home
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="arrow-right" />
            </span>
          </a>
        </aside>
      </section>
    </main>
  );
}
