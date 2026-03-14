import { AppIcon, type AppIconName } from "../components/app-icon";
import { buildAccessRequestUrl, buildAuthUrl, buildPublicUrl } from "../lib/surface";
import { useCompactLayout } from "../lib/use-compact-layout";
import { Fragment, useEffect, useState } from "react";

const githubDiscussionsUrl = "https://github.com/Tomodovodoo/ParetoProof/discussions";
const publicDocsBaseUrl = "https://github.com/Tomodovodoo/ParetoProof/blob/main/docs";

const projectRoute = "/project";
const benchmarksRoute = "/benchmarks";
const reportsRoutePrefix = "/reports/";

function buildDocsUrl(path: string) {
  const normalizedPath = path.replace(/^\/+/, "");
  return `${publicDocsBaseUrl}/${normalizedPath}`;
}

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
    methodologyHref: buildDocsUrl("product/public-benchmark-reporting-ux-baseline.md"),
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
    methodologyHref: buildDocsUrl("product/public-benchmark-reporting-ux-baseline.md"),
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
    detail: "versioned harness, locked inputs, full environment metadata per run",
    label: "Reproducible runs",
    value: "22"
  },
  {
    detail: "proof generation and statement formalization with public release tracking",
    label: "Benchmark types",
    value: "2 active"
  },
  {
    detail: "GPT, Claude, and Gemini families evaluated under identical conditions",
    label: "Models tested",
    value: "3 families"
  }
];

const publicBands = [
  {
    body:
      "Every benchmark run is tied to a versioned harness, locked inputs, and full environment metadata — so results are comparable across time and models.",
    eyebrow: "Reproducibility",
    title: "Every run is verifiable"
  },
  {
    body:
      "Results ship with methodology docs, scope notes, and data-quality flags instead of a single headline number. Partial publication is labeled, not hidden.",
    eyebrow: "Transparency",
    title: "No hidden conditions"
  },
  {
    body:
      "Coming soon: fully containerized Docker images where you can replay any benchmark run, bring your own API keys, and verify results independently.",
    eyebrow: "Coming soon",
    title: "Reproducible Docker replay"
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

const projectOverviewPoints = [
  {
    body:
      "ParetoProof measures what frontier systems can do on formal mathematical tasks under reproducible benchmark and execution conditions.",
    title: "What it is"
  },
  {
    body:
      "The public site explains released work, the auth surface handles sign-in, and the portal holds contributor and admin workflows.",
    title: "How the surfaces split"
  },
  {
    body:
      "Released results are tied to benchmark packages, environment details, and explicit auth or approval boundaries instead of marketing claims.",
    title: "Why trust matters"
  },
  {
    body:
      "The project is still an active MVP build-out. It is not an open compute playground or a finished self-serve research platform yet.",
    title: "Current posture"
  }
];

const contributorSteps: Array<{
  body: string;
  icon: AppIconName;
  kicker: string;
  title: string;
}> = [
  {
    body:
      "Start with the project pack, benchmark reporting, and update surfaces so you understand the current product boundary before requesting access.",
    icon: "compass",
    kicker: "Step 1",
    title: "Understand the project"
  },
  {
    body:
      "Approved contributors use the dedicated sign-in entry. GitHub and Google remain the supported human providers for reaching the portal flow.",
    icon: "key",
    kicker: "Step 2",
    title: "Approved sign-in"
  },
  {
    body:
      "New collaborators start with a separate access-request entry that verifies identity first, then lands them on the request form for manual review.",
    icon: "users",
    kicker: "Step 3",
    title: "Request access separately"
  },
  {
    body:
      "Approved work happens inside the portal, where profile, access, admin review, and future benchmark operations belong.",
    icon: "server",
    kicker: "Step 4",
    title: "Do the work in portal"
  }
];

const contactRoutes: Array<{
  body: string;
  external?: boolean;
  href: string;
  icon: AppIconName;
  label: string;
  title: string;
}> = [
  {
    body:
      "Public project questions and contributor-interest questions route to the repository Discussions index. It is the only public contact entry the apex site should publish in MVP.",
    external: true,
    href: githubDiscussionsUrl,
    icon: "github",
    label: "Open discussions",
    title: "GitHub Discussions"
  },
  {
    body:
      "Approved contributors should use the branded sign-in entry rather than trying to solve account state through public threads.",
    href: buildAuthUrl("/"),
    icon: "key",
    label: "Approved sign in",
    title: "Sign-in stays on auth"
  },
  {
    body:
      "First-time collaborators should verify identity and start from the dedicated access-request path instead of the portal sign-in route.",
    href: buildAccessRequestUrl(),
    icon: "users",
    label: "Request access",
    title: "New collaborators use a separate intake"
  }
];

const projectResources: Array<{
  body: string;
  external?: boolean;
  href: string;
  icon: AppIconName;
  label: string;
  title: string;
}> = [
  {
    body:
      "Read how public benchmark releases should be presented without turning the site into an analyst console.",
    external: true,
    href: buildDocsUrl("product/public-benchmark-reporting-ux-baseline.md"),
    icon: "flask",
    label: "Open reporting baseline",
    title: "Benchmark reporting"
  },
  {
    body:
      "See how canonical updates and release notes should land on the public surface as the project matures.",
    external: true,
    href: buildDocsUrl("product/release-notes-and-updates-baseline.md"),
    icon: "spark",
    label: "Open updates baseline",
    title: "Updates and release notes"
  },
  {
    body:
      "Follow the working methodology and architecture docs while the product surface is still being built out in public.",
    external: true,
    href: buildDocsUrl("README.md"),
    icon: "server",
    label: "Open docs index",
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

export function getCompactBenchmarkIndexSectionOrder() {
  return ["benchmarkCards", "summarySupport", "reportingRules"] as const;
}

export function getCompactProjectPackSectionOrder() {
  return [
    "overviewSection",
    "coverageSupport",
    "contributorsSection",
    "contactSection",
    "resourcesSection"
  ] as const;
}

export function getCompactHomeSectionOrder() {
  return ["summaryBands", "signalsSupport"] as const;
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

type PublicBenchmarkSummaryCard = {
  detail: string;
  label: string;
  value: string;
};

function PublicHeader({
  currentPath,
  homeHref
}: {
  currentPath: string;
  homeHref?: string;
}) {
  const isHome = currentPath === "/" || currentPath === "";
  const isProjectRoute = currentPath === projectRoute || currentPath.startsWith(`${projectRoute}/`);
  const isBenchmarksRoute =
    currentPath === benchmarksRoute ||
    currentPath.startsWith(`${benchmarksRoute}/`) ||
    currentPath.startsWith(reportsRoutePrefix);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="site-header-bar">
        <a className="site-brand" href={homeHref ?? buildPublicUrl("/")}>
          <span className="site-brand-mark" aria-hidden="true">
            <AppIcon name="spark" />
          </span>
          <span className="site-brand-name">ParetoProof</span>
        </a>

        <nav className="site-primary-nav" aria-label="Primary">
          <a
            className={`site-nav-link${isHome ? " site-nav-link-active" : ""}`}
            href={buildPublicUrl("/")}
          >
            Home
          </a>
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
          <a className="site-nav-link" href={buildDocsUrl("README.md")} rel="noreferrer" target="_blank">
            Docs
          </a>
        </nav>

        <div className="site-header-actions">
          <a className="button button-secondary site-header-github" href={githubDiscussionsUrl} rel="noreferrer" target="_blank">
            <span className="inline-icon" aria-hidden="true"><AppIcon name="github" /></span>
            GitHub
          </a>
          <a className="button" href={buildAuthUrl("/")}>
            Sign in
          </a>
          <button
            className="site-mobile-toggle"
            onClick={() => { setMobileNavOpen((open) => !open); }}
            type="button"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          >
            <span className="site-mobile-toggle-icon" aria-hidden="true">
              <AppIcon name={mobileNavOpen ? "panel-left" : "grid"} />
            </span>
          </button>
        </div>
      </div>

      {mobileNavOpen ? (
        <nav className="site-mobile-nav" aria-label="Mobile navigation">
          <a
            className={`site-mobile-nav-link${isHome ? " site-mobile-nav-link-active" : ""}`}
            href={buildPublicUrl("/")}
          >
            Home
          </a>
          <a
            className={`site-mobile-nav-link${isProjectRoute ? " site-mobile-nav-link-active" : ""}`}
            href={buildPublicUrl(projectRoute)}
          >
            Project
          </a>
          <a
            className={`site-mobile-nav-link${isBenchmarksRoute ? " site-mobile-nav-link-active" : ""}`}
            href={buildPublicUrl(benchmarksRoute)}
          >
            Benchmarks
          </a>
          <a className="site-mobile-nav-link" href={githubDiscussionsUrl} rel="noreferrer" target="_blank">
            GitHub Discussions
          </a>
          <a className="site-mobile-nav-link" href={buildDocsUrl("README.md")} rel="noreferrer" target="_blank">
            Docs
          </a>
          <a className="button site-mobile-nav-cta" href={buildAuthUrl("/")}>
            Approved sign in
          </a>
          <a className="button button-secondary site-mobile-nav-cta" href={buildAccessRequestUrl()}>
            Request access
          </a>
        </nav>
      ) : null}
    </header>
  );
}

function PublicFooter({ isProjectRoute }: { isProjectRoute: boolean }) {
  return (
    <footer className="site-footer" aria-label="Project entry points">
      <div className="site-footer-grid">
        <section className="site-footer-panel">
          <h2>Explore</h2>
          <div className="site-footer-links">
            <a className="site-footer-link" href={buildPublicUrl(benchmarksRoute)}>
              Benchmarks
            </a>
            {footerProjectLinks.map((link) => (
              <a
                className="site-footer-link"
                href={isProjectRoute ? `#${link.id}` : buildProjectSectionUrl(link.id)}
                key={link.id}
              >
                {link.label}
              </a>
            ))}
            <a
              className="site-footer-link"
              href={buildDocsUrl("README.md")}
              rel="noreferrer"
              target="_blank"
            >
              Docs
            </a>
          </div>
        </section>

        <section className="site-footer-panel">
          <h2>Contribute</h2>
          <div className="site-footer-links">
            <a className="site-footer-link" href={buildAuthUrl("/")}>
              Sign in
            </a>
            <a className="site-footer-link" href={buildAccessRequestUrl()}>
              Request access
            </a>
            <a className="site-footer-link" href={githubDiscussionsUrl} rel="noreferrer" target="_blank">
              GitHub Discussions
            </a>
          </div>
        </section>
      </div>
    </footer>
  );
}

function PublicBenchmarkSummary({
  ariaLabel,
  cards,
  compact
}: {
  ariaLabel: string;
  cards: PublicBenchmarkSummaryCard[];
  compact: boolean;
}) {
  if (compact) {
    return (
      <section className="site-benchmark-mobile-summary" aria-label={ariaLabel}>
        {cards.map((card) => (
          <article className="site-benchmark-mobile-card" key={card.label}>
            <span className="site-benchmark-mobile-value">{card.value}</span>
            <h2>{card.label}</h2>
            <p>{card.detail}</p>
          </article>
        ))}
      </section>
    );
  }

  return (
    <aside className="site-signal-column" aria-label={ariaLabel}>
      {cards.map((card) => (
        <article className="site-signal-row" key={card.label}>
          <span className="site-signal-value">{card.value}</span>
          <div>
            <h2>{card.label}</h2>
            <p>{card.detail}</p>
          </div>
        </article>
      ))}
    </aside>
  );
}

function PublicLanding() {
  const showInFlowSignals = useCompactLayout(640);

  const summaryBands = (
    <section className="site-band-grid" aria-label="Project summary">
      {publicBands.map((band) => (
        <article className="site-band" key={band.title}>
          <p className="section-tag">{band.eyebrow}</p>
          <h2>{band.title}</h2>
          <p>{band.body}</p>
        </article>
      ))}
    </section>
  );

  const signalsSupport = showInFlowSignals ? (
    <section className="site-project-section site-home-signals-support">
      <div className="site-card-grid">
        {publicSignals.map((signal) => (
          <article className="site-panel-card" key={signal.label}>
            <div className="site-panel-copy">
              <p className="section-tag">{signal.value}</p>
              <h3>{signal.label}</h3>
              <p>{signal.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  ) : null;

  return (
    <main
      className={`site-shell site-home-shell${showInFlowSignals ? " site-home-shell-compact" : ""}`}
    >
      <PublicHeader currentPath={window.location.pathname} />

      <section className="site-hero">
        <div className="site-hero-copy">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="compass" />
            </span>
            Formal math evaluation
          </p>
          <h1>Reproducible benchmarks for frontier math reasoning.</h1>
          <p className="site-lead">
            ParetoProof measures what frontier AI systems can actually do on formal
            mathematical tasks — with fully reproducible execution, transparent methodology,
            and results you can verify yourself via containerized replay.
          </p>
          <div className="hero-actions">
            <a className="button" href={buildPublicUrl(benchmarksRoute)}>
              View benchmarks
            </a>
            <a className="button button-secondary" href={buildPublicUrl(projectRoute)}>
              About the project
            </a>
          </div>
        </div>

        {!showInFlowSignals ? (
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
        ) : null}
      </section>

      {showInFlowSignals
        ? getCompactHomeSectionOrder().map((sectionId) => {
            const sections = {
              signalsSupport,
              summaryBands
            };

            return <Fragment key={sectionId}>{sections[sectionId]}</Fragment>;
          })
        : summaryBands}

      <PublicFooter isProjectRoute={false} />
    </main>
  );
}

function PublicBenchmarkIndex() {
  const isCompactLayout = useCompactLayout(480);
  const showInFlowSummary = useCompactLayout(640);
  const benchmarkIndexLead = "Browse released benchmark slices, see which models were tested, and open detailed release summaries with methodology and results.";
  const benchmarkIndexSummaryCards: PublicBenchmarkSummaryCard[] = [
    {
      detail: "Public benchmark release summaries listed on the apex site.",
      label: "Released slices",
      value: publicBenchmarks.length.toString().padStart(2, "0")
    },
    {
      detail: "Each benchmark card points at one current public release state.",
      label: "Latest reference",
      value: "01"
    },
    {
      detail: "Partial publication stays visible as scope, not benchmark failure.",
      label: "Data-quality first",
      value: "QA"
    }
  ];

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

  const reportingRules = (
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
  );

  const summarySupport = showInFlowSummary ? (
    <section className="site-project-section site-benchmark-index-summary-support">
      <PublicBenchmarkSummary
        ariaLabel="Benchmark index summary"
        cards={benchmarkIndexSummaryCards}
        compact
      />
    </section>
  ) : null;

  return (
    <main
      className={`site-shell site-benchmark-shell${
        showInFlowSummary ? " site-benchmark-index-shell-compact" : ""
      }`}
    >
      <PublicHeader currentPath={window.location.pathname} homeHref={buildPublicUrl("/")} />

      <section className="site-hero">
        <div className="site-hero-copy">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="flask" />
            </span>
            Public benchmark releases
          </p>
          <h1>Public benchmark releases.</h1>
          <p className="site-lead">{benchmarkIndexLead}</p>
          <div className="hero-actions">
            <a className="button" href={buildBenchmarkReportUrl(publicBenchmarks[0].benchmarkVersionId)}>
              Open latest release
            </a>
            <a className="button button-secondary" href={buildPublicUrl(projectRoute)}>
              Read the project pack
            </a>
          </div>
        </div>
        {!showInFlowSummary ? (
          <PublicBenchmarkSummary
            ariaLabel="Benchmark index summary"
            cards={benchmarkIndexSummaryCards}
            compact={false}
          />
        ) : null}
      </section>

      {showInFlowSummary
        ? getCompactBenchmarkIndexSectionOrder().map((sectionId) => {
            const sections = {
              benchmarkCards,
              reportingRules,
              summarySupport
            };

            return <Fragment key={sectionId}>{sections[sectionId]}</Fragment>;
          })
        : (
            <>
              {benchmarkCards}
              {reportingRules}
            </>
          )}

      <PublicFooter isProjectRoute={false} />
    </main>
  );
}

function PublicBenchmarkReport({
  benchmarkVersionId
}: {
  benchmarkVersionId: string;
}) {
  const showInFlowSummary = useCompactLayout(640);
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

  const reportSummaryCards: PublicBenchmarkSummaryCard[] = report.summaryCards.map((card) => ({
    detail: report.releaseLabel,
    label: card.label,
    value: card.value
  }));

  return (
    <main
      className={`site-shell site-benchmark-shell site-benchmark-report-shell${
        report.completeness === "partial" ? " site-benchmark-report-partial" : ""
      }`}
    >
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
        <PublicBenchmarkSummary
          ariaLabel="Release summary"
          cards={reportSummaryCards}
          compact={showInFlowSummary}
        />
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
          <h2>Results by model</h2>
          <p className="site-lead">
            Each model family is evaluated under identical benchmark conditions.
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
  const isCompactLayout = useCompactLayout(480);
  const showInFlowCoverage = useCompactLayout(640);

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

  const overviewSection = (
    <article className="site-project-section" id="overview">
      <div className="site-section-copy">
        <p className="section-tag">Project overview</p>
        <h2>What is ParetoProof?</h2>
        <p className="site-lead">
          A reproducible benchmark platform for evaluating frontier AI systems on formal
          mathematical tasks — with transparent methodology and verifiable results.
        </p>
      </div>

      <div className="site-editorial-grid">
        <div className="site-editorial-copy">
          <p>
            ParetoProof is a benchmark platform first, not a generic AI showcase. The public
            site should explain the mission, make the trust boundary obvious, and point
            people toward the right next step without turning every idea into its own page.
          </p>
          <p>
            That means one coherent public project route, one benchmark route, and one docs
            index. Everything else should either live in the portal or stay in implementation
            docs until it becomes a real user-facing surface.
          </p>
        </div>
        <div className="site-topic-list" aria-label="Project overview points">
          {projectOverviewPoints.map((point) => (
            <article className="site-topic-item" key={point.title}>
              <h3>{point.title}</h3>
              <p>{point.body}</p>
            </article>
          ))}
        </div>
      </div>
    </article>
  );

  const coverageSupport = showInFlowCoverage ? (
    <article className="site-project-section site-project-pack-coverage-support">
      <div className="site-topic-list site-topic-list-compact">
        {packCoverage.map((item) => (
          <article className="site-topic-item" key={item.label}>
            <p className="section-tag">{item.value}</p>
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </article>
  ) : null;

  const contributorsSection = (
    <article className="site-project-section" id="contributors">
      <div className="site-section-copy">
        <p className="section-tag">Contributor path</p>
        <h2>How to contribute</h2>
        <p className="site-lead">
          Contributors go through a manual approval process. Once approved, all work
          happens inside the portal.
        </p>
      </div>

      {isCompactLayout ? (
        <div className="hero-actions">
          <a className="button" href={buildAuthUrl("/")}>
            Approved contributor sign in
          </a>
          <a className="button button-secondary" href={buildAccessRequestUrl()}>
            Request collaborator access
          </a>
          <a className="button button-secondary" href={githubDiscussionsUrl}>
            Ask a public question first
          </a>
        </div>
      ) : null}

      <div className="site-step-grid">
        {contributorSteps.map((step) => (
          <article className="site-step-card" key={step.title}>
            <div className="site-step-head">
              <span className="site-panel-mark" aria-hidden="true">
                <AppIcon name={step.icon} />
              </span>
              <p className="section-tag">{step.kicker}</p>
            </div>
            <div className="site-panel-copy">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </div>

      {!isCompactLayout ? (
        <div className="hero-actions">
          <a className="button" href={buildAuthUrl("/")}>
            Approved contributor sign in
          </a>
          <a className="button button-secondary" href={buildAccessRequestUrl()}>
            Request collaborator access
          </a>
          <a className="button button-secondary" href={githubDiscussionsUrl}>
            Ask a public question first
          </a>
        </div>
      ) : null}
    </article>
  );

  const contactSection = (
    <article className="site-project-section" id="contact">
      <div className="site-section-copy">
        <p className="section-tag">Contact rules</p>
        <h2>Get in touch</h2>
        <p className="site-lead">
          Public questions go to GitHub Discussions. Access requests and account recovery
          are handled through the auth surface.
        </p>
      </div>

      <div className="site-link-list">
        {contactRoutes.map((route) => (
          <a
            className="site-link-row"
            href={route.href}
            key={route.title}
            rel={route.external ? "noreferrer" : undefined}
            target={route.external ? "_blank" : undefined}
          >
            <span className="site-panel-mark" aria-hidden="true">
              <AppIcon name={route.icon} />
            </span>
            <div className="site-link-row-copy">
              <p className="section-tag">{route.label}</p>
              <h3>{route.title}</h3>
              <p>{route.body}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="site-inline-note">
        <p>
          Do not post secrets, recovery details, or private approval context in public
          threads. MVP does not expose a support mailbox or private contact form from the
          public website.
        </p>
      </div>
    </article>
  );

  const resourcesSection = (
    <article className="site-project-section">
      <div className="site-section-copy">
        <p className="section-tag">Working surfaces</p>
        <h2>Resources</h2>
        <p className="site-lead">
          Methodology docs, release notes, and working documentation.
        </p>
      </div>

      <div className="site-link-list">
        {projectResources.map((resource) => (
          <a
            className="site-link-row"
            href={resource.href}
            key={resource.title}
            rel={resource.external ? "noreferrer" : undefined}
            target={resource.external ? "_blank" : undefined}
          >
            <span className="site-panel-mark" aria-hidden="true">
              <AppIcon name={resource.icon} />
            </span>
            <div className="site-link-row-copy">
              <p className="section-tag">{resource.label}</p>
              <h3>{resource.title}</h3>
              <p>{resource.body}</p>
            </div>
          </a>
        ))}
      </div>
    </article>
  );

  return (
    <main
      className={`site-shell site-project-shell${
        showInFlowCoverage ? " site-project-pack-shell-compact" : ""
      }`}
    >
      <PublicHeader currentPath={window.location.pathname} homeHref={buildPublicUrl("/")} />

      <section className="site-hero site-hero-project">
        <div className="site-hero-copy">
          <p className="eyebrow">
            <span className="inline-icon" aria-hidden="true">
              <AppIcon name="grid" />
            </span>
            Project pack
          </p>
          <h1>About ParetoProof.</h1>
          <p className="site-lead">
            What the project is, how contributors get involved, and where to direct
            questions — all in one place.
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

        {!showInFlowCoverage ? (
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
        ) : null}
      </section>

      <section className="site-section-stack" aria-label="Project pack sections">
        {showInFlowCoverage
          ? getCompactProjectPackSectionOrder().map((sectionId) => {
              const sections = {
                contactSection,
                contributorsSection,
                coverageSupport,
                overviewSection,
                resourcesSection
              };

              return <Fragment key={sectionId}>{sections[sectionId]}</Fragment>;
            })
          : (
              <>
                {overviewSection}
                {contributorsSection}
                {contactSection}
                {resourcesSection}
              </>
            )}
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
