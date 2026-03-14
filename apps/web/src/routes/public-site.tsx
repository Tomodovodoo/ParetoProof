import { AppIcon, type AppIconName } from "../components/app-icon";
import { buildAuthUrl, buildPublicUrl } from "../lib/surface";
import { useCompactLayout } from "../lib/use-compact-layout";
import { useEffect } from "react";

const githubDiscussionsUrl = "https://github.com/Tomodovodoo/ParetoProof/discussions";
const publicDocsBaseUrl = "https://github.com/Tomodovodoo/ParetoProof/blob/main/docs";

const projectRoute = "/project";
const benchmarksRoute = "/benchmarks";
const reportsRoutePrefix = "/reports/";

const publicBenchmarks = [
  {
    benchmarkVersionId: "problem-9-v1",
    description:
      "Offline Lean proof-generation bundle focused on reproducible execution, failure taxonomy, and benchmark-package integrity.",
    headlineMetric: "61% pass rate",
    latestReleaseLabel: "Release 2026-03",
    releaseStatus: "complete",
    scopeNote: "Single released slice covering the current Problem 9 proof-generation bundle.",
    taskType: "Proof generation",
    title: "Problem 9"
  },
  {
    benchmarkVersionId: "statement-formalization-pilot-v1",
    description:
      "Pilot release for public statement-formalization reporting while canonical artifact and verification contracts stabilize.",
    headlineMetric: "Partial publication",
    latestReleaseLabel: "Release 2026-02",
    releaseStatus: "partial",
    scopeNote: "Published subset only while the remaining benchmark package stays withheld for methodology review.",
    taskType: "Statement formalization",
    title: "Statement Formalization Pilot"
  }
] as const;

const publicBenchmarkReports = {
  "problem-9-v1": {
    benchmarkVersionId: "problem-9-v1",
    completeness: "complete",
    dateLabel: "March 2026",
    description:
      "Public release for the Problem 9 proof-generation benchmark slice under the current offline run-bundle contract.",
    includedConfigs: "3 configs",
    latestStatus: "mixed",
    methodologyHref: `${publicDocsBaseUrl}/public-benchmark-reporting-ux-baseline.md`,
    qualityNotice:
      "Complete public release for the current disclosed slice. Held-out or internal-only benchmark material remains out of scope for this report.",
    qualityState: "complete",
    releaseLabel: "Release 2026-03",
    results: [
      {
        displayLabel: "OpenAI GPT-OSS",
        includedCount: "36 / 59 solved",
        providerLabel: "OpenAI family",
        status: "mixed",
        updatedAt: "Updated Mar 2026"
      },
      {
        displayLabel: "Claude Sonnet",
        includedCount: "31 / 59 solved",
        providerLabel: "Anthropic family",
        status: "mixed",
        updatedAt: "Updated Mar 2026"
      },
      {
        displayLabel: "Gemini 2.5 Pro",
        includedCount: "24 / 59 solved",
        providerLabel: "Google family",
        status: "fail",
        updatedAt: "Updated Mar 2026"
      }
    ],
    scopeNote:
      "Includes the currently disclosed proof-generation benchmark package and released model configurations only.",
    summaryCards: [
      { label: "Configs included", value: "03" },
      { label: "Evaluated items", value: "59" },
      { label: "Solved count", value: "36 top score" },
      { label: "Release state", value: "complete" }
    ],
    title: "Problem 9 public release"
  },
  "statement-formalization-pilot-v1": {
    benchmarkVersionId: "statement-formalization-pilot-v1",
    completeness: "partial",
    dateLabel: "February 2026",
    description:
      "Public pilot release for statement-formalization reporting while the remaining package stays withheld for methodology and verification review.",
    includedConfigs: "2 configs",
    latestStatus: "partial",
    methodologyHref: `${publicDocsBaseUrl}/public-benchmark-reporting-ux-baseline.md`,
    qualityNotice:
      "Partial publication: some intended rows are still withheld while the canonical formal-statement verification policy is finalized.",
    qualityState: "partial",
    releaseLabel: "Release 2026-02",
    results: [
      {
        displayLabel: "OpenAI GPT-OSS",
        includedCount: "18 / 34 solved",
        providerLabel: "OpenAI family",
        status: "mixed",
        updatedAt: "Updated Feb 2026"
      },
      {
        displayLabel: "Claude Sonnet",
        includedCount: "14 / 34 solved",
        providerLabel: "Anthropic family",
        status: "mixed",
        updatedAt: "Updated Feb 2026"
      }
    ],
    scopeNote:
      "Covers only the public pilot subset. Withheld statement sets are excluded from all shown metrics.",
    summaryCards: [
      { label: "Configs included", value: "02" },
      { label: "Evaluated items", value: "34" },
      { label: "Solved count", value: "18 top score" },
      { label: "Release state", value: "partial" }
    ],
    title: "Statement formalization pilot release"
  }
} as const;

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

function buildProjectSectionUrl(sectionId: string) {
  return buildPublicUrl(`${projectRoute}#${sectionId}`);
}

function buildBenchmarkReportUrl(benchmarkVersionId: string) {
  return buildPublicUrl(`${reportsRoutePrefix}${encodeURIComponent(benchmarkVersionId)}`);
}

function formatReleaseStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function resolvePublicSiteRoute(pathname: string) {
  if (pathname === projectRoute || pathname.startsWith(`${projectRoute}/`)) {
    return { kind: "project" as const };
  }

  if (pathname === benchmarksRoute || pathname.startsWith(`${benchmarksRoute}/`)) {
    return { kind: "benchmarks" as const };
  }

  if (pathname.startsWith(reportsRoutePrefix)) {
    const benchmarkVersionId = pathname.slice(reportsRoutePrefix.length).split("/")[0] ?? "";

    return {
      benchmarkVersionId: decodeURIComponent(benchmarkVersionId),
      kind: "report" as const
    };
  }

  return { kind: "home" as const };
}

const footerProjectLinks = [
  { id: "overview", label: "Project overview" },
  { id: "contributors", label: "Contributor path" },
  { id: "contact", label: "Contact rules" }
];

function PublicHeader({
  currentPath,
  homeHref
}: {
  currentPath: string;
  homeHref?: string;
}) {
  const isProjectRoute = currentPath === projectRoute || currentPath.startsWith(`${projectRoute}/`);
  const isBenchmarksRoute =
    currentPath === benchmarksRoute ||
    currentPath.startsWith(`${benchmarksRoute}/`) ||
    currentPath.startsWith(reportsRoutePrefix);

  return (
    <header className="site-header">
      <div className="site-header-main">
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

        <nav className="site-primary-nav" aria-label="Primary">
          <a
            className={`site-nav-link${isProjectRoute ? " site-nav-link-active" : ""}`}
            href={buildPublicUrl(projectRoute)}
          >
            Project
          </a>
          <a
            className={`site-nav-link${isBenchmarksRoute ? " site-nav-link-active" : ""}`}
            href={buildPublicUrl(benchmarksRoute)}
          >
            Benchmarks
          </a>
        </nav>
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

function PublicFooter({ isProjectRoute }: { isProjectRoute: boolean }) {
  return (
    <footer className="site-footer" aria-label="Project entry points">
      <div className="site-footer-grid">
        <section className="site-footer-panel">
          <p className="section-tag">Project route</p>
          <h2>One public entry, three anchored sections.</h2>
          <p>
            The public site exposes one consolidated `Project` destination, then routes
            readers into the exact section they need.
          </p>
          <div className="site-footer-links">
            {footerProjectLinks.map((link) => (
              <a
                className="site-footer-link"
                href={isProjectRoute ? `#${link.id}` : buildProjectSectionUrl(link.id)}
                key={link.id}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>

        <section className="site-footer-panel">
          <p className="section-tag">Public routing</p>
          <h2>Keep discoverability on the apex surface.</h2>
          <p>
            Contributor sign-in still routes into auth, public questions still route to
            GitHub Discussions, and the apex site keeps the project explanation in one place.
          </p>
          <div className="site-footer-links">
            <a className="site-footer-link" href={buildAuthUrl("/")}>
              Contributor sign in
            </a>
            <a className="site-footer-link" href={githubDiscussionsUrl} rel="noreferrer" target="_blank">
              GitHub Discussions
            </a>
            <a
              className="site-footer-link"
              href={`${publicDocsBaseUrl}/README.md`}
              rel="noreferrer"
              target="_blank"
            >
              Working docs
            </a>
          </div>
        </section>
      </div>
    </footer>
  );
}

function PublicLanding() {
  return (
    <main className="site-shell site-home-shell">
      <PublicHeader currentPath={window.location.pathname} />

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

      <PublicFooter isProjectRoute={false} />
    </main>
  );
}

function PublicBenchmarkIndex() {
  const isCompactLayout = useCompactLayout(480);

  const benchmarkCards = (
    <section
      className={`site-card-grid${isCompactLayout ? " site-benchmark-card-grid-compact" : ""}`}
      aria-label="Public benchmark index"
    >
      {publicBenchmarks.map((benchmark) => (
        <article className="site-panel-card" key={benchmark.benchmarkVersionId}>
          <div className="site-panel-copy">
            <p className="section-tag">{benchmark.taskType}</p>
            <h3>{benchmark.title}</h3>
            <p>{benchmark.description}</p>
            <p>
              Latest release: <strong>{benchmark.latestReleaseLabel}</strong>
            </p>
            <p>
              Status: <strong>{formatReleaseStatus(benchmark.releaseStatus)}</strong>
            </p>
            <p>
              Headline metric: <strong>{benchmark.headlineMetric}</strong>
            </p>
            <p>{benchmark.scopeNote}</p>
          </div>
          <a className="button button-secondary" href={buildBenchmarkReportUrl(benchmark.benchmarkVersionId)}>
            Open release summary
          </a>
        </article>
      ))}
    </section>
  );

  return (
    <main className="site-shell site-benchmark-shell">
      <PublicHeader currentPath={window.location.pathname} homeHref={buildPublicUrl("/")} />

      <section className="site-hero">
        <div className="site-hero-copy">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="flask" />
            </span>
            Public benchmark releases
          </p>
          <h1>Read the current public benchmark slices without dropping into portal internals.</h1>
          <p className="site-lead">
            The benchmark index is release-oriented, not run-oriented. It shows which benchmark
            slices are public, which release is current, and whether the visible numbers are
            complete, partial, or historically superseded.
          </p>
          <div className="hero-actions">
            <a className="button" href={buildBenchmarkReportUrl(publicBenchmarks[0].benchmarkVersionId)}>
              Open latest release
            </a>
            <a className="button button-secondary" href={buildPublicUrl(projectRoute)}>
              Read the project pack
            </a>
          </div>
        </div>

        <aside className="site-signal-column" aria-label="Benchmark index summary">
          <article className="site-signal-row">
            <span className="site-signal-value">{publicBenchmarks.length.toString().padStart(2, "0")}</span>
            <div>
              <h2>Released slices</h2>
              <p>Each card points at one public benchmark release summary instead of a private run table.</p>
            </div>
          </article>
          <article className="site-signal-row">
            <span className="site-signal-value">01</span>
            <div>
              <h2>Latest reference</h2>
              <p>Each benchmark lists one current public reference point and its release state.</p>
            </div>
          </article>
          <article className="site-signal-row">
            <span className="site-signal-value">QA</span>
            <div>
              <h2>Data-quality first</h2>
              <p>Partial or withheld publication is called out as release scope, not benchmark failure.</p>
            </div>
          </article>
        </aside>
      </section>

      {benchmarkCards}

      <section className="site-band-grid" aria-label="Reporting rules">
        <article className="site-band">
          <p className="section-tag">Release flow</p>
          <h2>Public reporting stays release-centric.</h2>
          <p>
            Benchmark cards route into one release summary page with stable top-line metrics,
            one visible notice block, and links to methodology rather than private evidence consoles.
          </p>
        </article>
        <article className="site-band">
          <p className="section-tag">What not to expect</p>
          <h2>No public run drilldown.</h2>
          <p>
            Per-run evidence, artifact inspection, and operational rerun context remain in the
            authenticated portal. The public site only shows released benchmark slices.
          </p>
        </article>
      </section>

      <PublicFooter isProjectRoute={false} />
    </main>
  );
}

function PublicBenchmarkReport({
  benchmarkVersionId
}: {
  benchmarkVersionId: string;
}) {
  const report =
    publicBenchmarkReports[benchmarkVersionId as keyof typeof publicBenchmarkReports] ?? null;

  if (!report) {
    return (
      <main className="site-shell site-benchmark-shell site-report-unavailable-shell">
        <PublicHeader currentPath={window.location.pathname} homeHref={buildPublicUrl("/")} />

        <section className="site-hero">
          <div className="site-hero-copy">
            <p className="eyebrow">
              <span className="inline-icon" aria-hidden="true">
                <AppIcon name="shield" />
              </span>
              Benchmark release unavailable
            </p>
            <h1>No public benchmark release matches this report id.</h1>
            <p className="site-lead">
              This route is reserved for released benchmark summaries. If the release is partial,
              withheld, or not yet public, the benchmark index remains the canonical public entry point.
            </p>
            <div className="hero-actions">
              <a className="button" href={buildPublicUrl(benchmarksRoute)}>
                Return to benchmark index
              </a>
              <a className="button button-secondary" href={buildPublicUrl(projectRoute)}>
                Read the project pack
              </a>
            </div>
          </div>
        </section>

        <PublicFooter isProjectRoute={false} />
      </main>
    );
  }

  return (
    <main className="site-shell site-benchmark-shell site-benchmark-report-shell">
        <PublicHeader currentPath={window.location.pathname} homeHref={buildPublicUrl(benchmarksRoute)} />

      <section className="site-hero">
        <div className="site-hero-copy">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="flask" />
            </span>
            Benchmark release summary
          </p>
          <h1>{report.title}</h1>
          <p className="site-lead">{report.description}</p>
          <div className="hero-actions">
            <a className="button" href={report.methodologyHref} rel="noreferrer" target="_blank">
              Open methodology
            </a>
            <a className="button button-secondary" href={buildPublicUrl(benchmarksRoute)}>
              Browse benchmark index
            </a>
          </div>
        </div>

        <aside className="site-signal-column" aria-label="Release summary">
          {report.summaryCards.map((card) => (
            <article className="site-signal-row" key={card.label}>
              <span className="site-signal-value">{card.value}</span>
              <div>
                <h2>{card.label}</h2>
                <p>{report.releaseLabel}</p>
              </div>
            </article>
          ))}
        </aside>
      </section>

      <section className="site-band-grid" aria-label="Release metadata">
        <article className="site-band">
          <p className="section-tag">Release metadata</p>
          <h2>{report.releaseLabel}</h2>
          <p>
            Version id: <strong>{report.benchmarkVersionId}</strong>
          </p>
          <p>
            Release date: <strong>{report.dateLabel}</strong>
          </p>
          <p>{report.scopeNote}</p>
        </article>
        <article className="site-band">
          <p className="section-tag">Data quality</p>
          <h2>{formatReleaseStatus(report.qualityState)}</h2>
          <p>{report.qualityNotice}</p>
        </article>
        <article className="site-band">
          <p className="section-tag">Public scope</p>
          <h2>{report.includedConfigs}</h2>
          <p>
            Outcome state: <strong>{formatReleaseStatus(report.latestStatus)}</strong>
          </p>
          <p>Portal drilldown and per-run evidence remain out of scope for the public release page.</p>
        </article>
      </section>

      <section className="site-project-section" aria-label="Public results table">
        <div className="site-section-copy">
          <p className="section-tag">Primary public results</p>
          <h2>One release table, presented as calm mobile-safe rows.</h2>
          <p className="site-lead">
            Public reporting keeps one visible results surface per release. It distinguishes
            benchmark outcome from data quality instead of collapsing everything into one badge.
          </p>
        </div>

        <div className="site-card-grid">
          {report.results.map((row) => (
            <article className="site-panel-card" key={row.displayLabel}>
              <div className="site-panel-copy">
                <p className="section-tag">{row.providerLabel}</p>
                <h3>{row.displayLabel}</h3>
                <p>
                  Solved or pass summary: <strong>{row.includedCount}</strong>
                </p>
                <p>
                  Status: <strong>{formatReleaseStatus(row.status)}</strong>
                </p>
                <p>{row.updatedAt}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <PublicFooter isProjectRoute={false} />
    </main>
  );
}

function PublicProjectPack() {
  useEffect(() => {
    function scrollProjectHashIntoView() {
      if (!window.location.hash) {
        return;
      }

      const target = document.querySelector(window.location.hash);

      if (!target) {
        return;
      }

      window.requestAnimationFrame(() => {
        target.scrollIntoView({
          behavior: "auto",
          block: "start"
        });
      });
    }

    scrollProjectHashIntoView();
    window.addEventListener("hashchange", scrollProjectHashIntoView);

    return () => {
      window.removeEventListener("hashchange", scrollProjectHashIntoView);
    };
  }, []);

  return (
    <main className="site-shell site-project-shell">
      <PublicHeader currentPath={window.location.pathname} homeHref={buildPublicUrl("/")} />

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

      <PublicFooter isProjectRoute />
    </main>
  );
}

export function PublicSite() {
  const route = resolvePublicSiteRoute(window.location.pathname);

  if (route.kind === "project") {
    return <PublicProjectPack />;
  }

  if (route.kind === "benchmarks") {
    return <PublicBenchmarkIndex />;
  }

  if (route.kind === "report") {
    return <PublicBenchmarkReport benchmarkVersionId={route.benchmarkVersionId} />;
  }

  return <PublicLanding />;
}
