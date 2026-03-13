import { AppIcon, type AppIconName } from "../components/app-icon";
import { buildAuthUrl, buildPublicUrl } from "../lib/surface";

const githubDiscussionsUrl = "https://github.com/Tomodovodoo/ParetoProof/discussions";
const publicDocsBaseUrl = "https://github.com/Tomodovodoo/ParetoProof/blob/main/docs";

const publicSignals = [
  {
    detail: "versioned harness inputs, environment metadata, and comparable outputs",
    label: "Reproducible runs",
    value: "22"
  },
  {
    detail: "researchers, mathematicians, and admins see distinct surfaces",
    label: "Approval model",
    value: "role aware"
  },
  {
    detail: "API control plane separated from heavier Lean and model execution",
    label: "Execution split",
    value: "API / workers"
  }
];

const publicBands = [
  {
    body:
      "ParetoProof tracks what actually ran, under which identities, and with which execution contracts instead of publishing one-off benchmark claims.",
    eyebrow: "Benchmark ledger",
    title: "Evidence before hype"
  },
  {
    body:
      "Contributor approval, identity linking, and recovery are product surfaces. They do not live in a side spreadsheet bolted onto auth.",
    eyebrow: "Access model",
    title: "Operational trust"
  },
  {
    body:
      "Cloudflare owns entry, Railway owns the control plane, Neon owns structured state, and workers stay separate from the public backend.",
    eyebrow: "Hosting posture",
    title: "Control-plane split"
  }
];

const packCoverage = [
  {
    detail: "why the project exists, who it serves, and how the public/auth/portal split works",
    label: "Project overview",
    value: "01"
  },
  {
    detail: "how contributor entry works without promising open self-serve access or hidden shortcuts",
    label: "Contributor path",
    value: "02"
  },
  {
    detail: "where public questions go, and where access recovery definitely does not go",
    label: "Contact boundary",
    value: "03"
  }
];

const projectOverviewCards: Array<{
  body: string;
  icon: AppIconName;
  title: string;
}> = [
  {
    body:
      "ParetoProof measures what frontier systems can do on formal mathematical tasks under reproducible benchmark and execution conditions.",
    icon: "compass",
    title: "What it is"
  },
  {
    body:
      "The public site explains released work, the auth surface handles sign-in, and the portal holds contributor and admin workflows.",
    icon: "grid",
    title: "How the surfaces split"
  },
  {
    body:
      "Released results are tied to benchmark packages, environment details, and explicit auth or approval boundaries instead of marketing claims.",
    icon: "shield",
    title: "Why trust matters"
  },
  {
    body:
      "The project is still an active MVP build-out. It is not an open compute playground or a finished self-serve research platform yet.",
    icon: "spark",
    title: "Current posture"
  }
];

const contributorSteps: Array<{
  body: string;
  icon: AppIconName;
  title: string;
}> = [
  {
    body:
      "Start with the project pack, benchmark reporting, and update surfaces so you understand the current product boundary before requesting access.",
    icon: "compass",
    title: "Understand the project"
  },
  {
    body:
      "Use the branded sign-in entry. GitHub and Google remain the supported human providers for reaching the portal flow.",
    icon: "key",
    title: "Sign in cleanly"
  },
  {
    body:
      "Approval is manual and role-aware. The MVP does not promise open enrollment, public run launch for every account, or automated invitations.",
    icon: "users",
    title: "Request or recover access"
  },
  {
    body:
      "Approved work happens inside the portal, where profile, access, admin review, and future benchmark operations belong.",
    icon: "server",
    title: "Do the work in portal"
  }
];

const contactCards: Array<{
  body: string;
  external?: boolean;
  href?: string;
  icon: AppIconName;
  title: string;
}> = [
  {
    body:
      "Public project questions and contributor-interest questions route to the repository Discussions index. It is the only public contact entry the apex site should publish in MVP.",
    external: true,
    href: githubDiscussionsUrl,
    icon: "github",
    title: "GitHub Discussions"
  },
  {
    body:
      "If the problem is reaching the portal or understanding which auth path to use, go through the sign-in and recovery flow instead of posting account details publicly.",
    href: buildAuthUrl("/"),
    icon: "key",
    title: "Access and recovery stay in auth"
  },
  {
    body:
      "Do not post secrets, personal recovery details, or anything that needs confidential handling. The public site does not publish a support mailbox or private intake form in MVP.",
    icon: "shield",
    title: "Keep sensitive details out of public threads"
  }
];

const projectResources: Array<{
  body: string;
  external?: boolean;
  href: string;
  icon: AppIconName;
  title: string;
}> = [
  {
    body:
      "Read how public benchmark releases should be presented without turning the site into an analyst console.",
    external: true,
    href: `${publicDocsBaseUrl}/public-benchmark-reporting-ux-baseline.md`,
    icon: "flask",
    title: "Benchmark reporting"
  },
  {
    body:
      "See how canonical updates and release notes should land on the public surface as the project matures.",
    external: true,
    href: `${publicDocsBaseUrl}/release-notes-and-updates-baseline.md`,
    icon: "spark",
    title: "Updates and release notes"
  },
  {
    body:
      "Follow the working methodology and architecture docs while the product surface is still being built out in public.",
    external: true,
    href: `${publicDocsBaseUrl}/README.md`,
    icon: "server",
    title: "Working docs"
  }
];

function PublicHeader({ homeHref }: { homeHref?: string }) {
  return (
    <header className="site-header">
      <div className="site-brand">
        <span className="site-brand-mark" aria-hidden="true">
          <AppIcon name="spark" />
        </span>
        <div>
          <p className="eyebrow">ParetoProof</p>
          <p className="site-tagline">
            Formal benchmark infrastructure for mathematical reasoning systems.
          </p>
        </div>
      </div>

      <div className="site-header-actions">
        {homeHref ? (
          <a className="button button-secondary" href={homeHref}>
            Return to apex home
          </a>
        ) : null}
        <a className="button" href={buildAuthUrl("/")}>
          Contributor sign in
        </a>
      </div>
    </header>
  );
}

function PublicLanding() {
  return (
    <main className="site-shell">
      <PublicHeader />

      <section className="site-hero">
        <div className="site-hero-copy">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="compass" />
            </span>
            Formal math evaluation
          </p>
          <h1>Measure frontier reasoning with reproducible proof workflows.</h1>
          <p className="site-lead">
            ParetoProof exists to answer what frontier systems can actually do on formal
            mathematical tasks without hiding the auth, approval, or execution conditions
            that make the result trustworthy.
          </p>
          <div className="hero-actions">
            <a className="button" href={buildPublicUrl("/project")}>
              Open the project pack
            </a>
            <a className="button button-secondary" href={buildAuthUrl("/")}>
              Contributor sign in
            </a>
          </div>
        </div>

        <aside className="site-signal-column" aria-label="Project signals">
          {publicSignals.map((signal) => (
            <article className="site-signal-row" key={signal.label}>
              <span className="site-signal-value">{signal.value}</span>
              <div>
                <h2>{signal.label}</h2>
                <p>{signal.detail}</p>
              </div>
            </article>
          ))}
        </aside>
      </section>

      <section className="site-band-grid" aria-label="Project summary">
        {publicBands.map((band) => (
          <article className="site-band" key={band.title}>
            <p className="section-tag">{band.eyebrow}</p>
            <h2>{band.title}</h2>
            <p>{band.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function PublicProjectPack() {
  return (
    <main className="site-shell site-project-shell">
      <PublicHeader homeHref={buildPublicUrl("/")} />

      <section className="site-hero site-hero-project">
        <div className="site-hero-copy">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="grid" />
            </span>
            Project pack
          </p>
          <h1>One public pack for project context, contributor entry, and contact rules.</h1>
          <p className="site-lead">
            This route family is the apex-owned answer to three questions: what ParetoProof
            is, how a contributor actually gets into the portal flow, and where public
            questions go without pretending the MVP already has a support desk.
          </p>

          <div className="site-pill-row" aria-label="Project pack sections">
            <a className="site-pill-link" href="#overview">
              Overview
            </a>
            <a className="site-pill-link" href="#contributors">
              Contributor path
            </a>
            <a className="site-pill-link" href="#contact">
              Contact rules
            </a>
          </div>
        </div>

        <aside className="site-signal-column" aria-label="Project pack coverage">
          {packCoverage.map((item) => (
            <article className="site-signal-row" key={item.label}>
              <span className="site-signal-value">{item.value}</span>
              <div>
                <h2>{item.label}</h2>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </aside>
      </section>

      <section className="site-section-stack" aria-label="Project pack sections">
        <article className="site-project-section" id="overview">
          <div className="site-section-copy">
            <p className="section-tag">Project overview</p>
            <h2>Explain the product without duplicating the whole methodology archive.</h2>
            <p className="site-lead">
              The public site should state the product purpose, the trust boundary, and the
              surface split clearly, then route readers outward to the deeper benchmark and
              methodology material instead of burying them in one giant wall of copy.
            </p>
          </div>

          <div className="site-card-grid">
            {projectOverviewCards.map((card) => (
              <article className="site-panel-card" key={card.title}>
                <span className="site-panel-mark" aria-hidden="true">
                  <AppIcon name={card.icon} />
                </span>
                <div className="site-panel-copy">
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="site-project-section" id="contributors">
          <div className="site-section-copy">
            <p className="section-tag">Contributor path</p>
            <h2>Move serious contributors into auth and portal work without promising open enrollment.</h2>
            <p className="site-lead">
              ParetoProof is not using the public site as a broad volunteer funnel. The
              contributor path explains how technical contributors enter the branded auth
              flow, how approval stays manual, and where actual work happens once someone is
              inside.
            </p>
          </div>

          <div className="site-card-grid">
            {contributorSteps.map((step) => (
              <article className="site-panel-card" key={step.title}>
                <span className="site-panel-mark" aria-hidden="true">
                  <AppIcon name={step.icon} />
                </span>
                <div className="site-panel-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="hero-actions">
            <a className="button" href={buildAuthUrl("/")}>
              Start contributor sign in
            </a>
            <a className="button button-secondary" href={githubDiscussionsUrl}>
              Ask a public question first
            </a>
          </div>
        </article>

        <article className="site-project-section" id="contact">
          <div className="site-section-copy">
            <p className="section-tag">Contact rules</p>
            <h2>Keep public contact narrow, manual, and honest.</h2>
            <p className="site-lead">
              The MVP public contact entry is GitHub Discussions. Access and recovery stay in
              the sign-in or portal flow, and the site should never invite people to post
              secrets or sensitive account details in public.
            </p>
          </div>

          <div className="site-card-grid">
            {contactCards.map((card) => {
              const content = (
                <>
                  <span className="site-panel-mark" aria-hidden="true">
                    <AppIcon name={card.icon} />
                  </span>
                  <div className="site-panel-copy">
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </div>
                </>
              );

              if (!card.href) {
                return (
                  <article className="site-panel-card" key={card.title}>
                    {content}
                  </article>
                );
              }

              return (
                <a
                  className="site-panel-card site-panel-card-link"
                  href={card.href}
                  key={card.title}
                  rel={card.external ? "noreferrer" : undefined}
                  target={card.external ? "_blank" : undefined}
                >
                  {content}
                </a>
              );
            })}
          </div>
        </article>

        <article className="site-project-section">
          <div className="site-section-copy">
            <p className="section-tag">Working surfaces</p>
            <h2>Route outward to the benchmark, update, and methodology material that already exists.</h2>
            <p className="site-lead">
              The project pack should not try to restate every benchmark, release, or policy
              detail inline. It should send readers to the current working sources that
              explain those slices more deeply.
            </p>
          </div>

          <div className="site-card-grid">
            {projectResources.map((resource) => (
              <a
                className="site-panel-card site-panel-card-link"
                href={resource.href}
                key={resource.title}
                rel={resource.external ? "noreferrer" : undefined}
                target={resource.external ? "_blank" : undefined}
              >
                <span className="site-panel-mark" aria-hidden="true">
                  <AppIcon name={resource.icon} />
                </span>
                <div className="site-panel-copy">
                  <h3>{resource.title}</h3>
                  <p>{resource.body}</p>
                </div>
              </a>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

export function PublicSite() {
  const pathname = window.location.pathname;

  if (pathname === "/project" || pathname.startsWith("/project/")) {
    return <PublicProjectPack />;
  }

  return <PublicLanding />;
}
