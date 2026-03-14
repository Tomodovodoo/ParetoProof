import { AppIcon, type AppIconName } from "../components/app-icon";
import { buildAccessRequestUrl, buildAuthUrl, buildPublicUrl } from "../lib/surface";
import { useCompactLayout } from "../lib/use-compact-layout";
import { Fragment, useEffect, useState } from "react";

const githubRepoUrl = "https://github.com/Tomodovodoo/ParetoProof";
const githubDiscussionsUrl = "https://github.com/Tomodovodoo/ParetoProof/discussions";
const publicDocsBaseUrl = "https://github.com/Tomodovodoo/ParetoProof/blob/main/docs";

const projectRoute = "/project";
const benchmarksRoute = "/benchmarks";
const reportsRoutePrefix = "/reports/";

function buildDocsUrl(path: string) {
  const normalizedPath = path.replace(/^\/+/, "");
  return `${publicDocsBaseUrl}/${normalizedPath}`;
}

/* ---------------------------------------------------------------------------
 * Benchmark data — honest status, no fabricated metrics
 * -------------------------------------------------------------------------*/

const publicBenchmarks = [
  {
    benchmarkVersionId: "problem-9-v1",
    description:
      "Lean 4 proof generation across 59 competition-level problems. Models are evaluated under identical harness conditions with full environment capture.",
    latestReleaseLabel: "Release 2026-03",
    releaseStatus: "complete",
    taskType: "Proof generation",
    title: "Problem 9"
  },
  {
    benchmarkVersionId: "statement-formalization-pilot-v1",
    description:
      "Pilot benchmark for translating natural-language math statements into Lean 4 formal definitions. Subset published while verification contracts stabilize.",
    latestReleaseLabel: "Release 2026-02",
    releaseStatus: "partial",
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
      "Full public release of the Problem 9 proof-generation benchmark. Three model families evaluated under identical conditions.",
    includedConfigs: "3 configs",
    latestStatus: "mixed",
    methodologyHref: buildDocsUrl("benchmarks.md"),
    releaseLabel: "Release 2026-03",
    results: [
      {
        displayLabel: "OpenAI GPT-OSS",
        includedCount: "36 / 59 solved",
        providerLabel: "OpenAI",
        status: "mixed",
        updatedAt: "Updated Mar 2026"
      },
      {
        displayLabel: "Claude Sonnet",
        includedCount: "31 / 59 solved",
        providerLabel: "Anthropic",
        status: "mixed",
        updatedAt: "Updated Mar 2026"
      },
      {
        displayLabel: "Gemini 2.5 Pro",
        includedCount: "24 / 59 solved",
        providerLabel: "Google",
        status: "fail",
        updatedAt: "Updated Mar 2026"
      }
    ],
    summaryCards: [
      { label: "Configs", value: "03" },
      { label: "Problems", value: "59" },
      { label: "Top score", value: "36" },
      { label: "Status", value: "complete" }
    ],
    title: "Problem 9 — public release"
  },
  "statement-formalization-pilot-v1": {
    benchmarkVersionId: "statement-formalization-pilot-v1",
    completeness: "partial",
    dateLabel: "February 2026",
    description:
      "Pilot release for statement formalization. Some rows withheld while verification contracts are finalized.",
    includedConfigs: "2 configs",
    latestStatus: "partial",
    methodologyHref: buildDocsUrl("benchmarks.md"),
    releaseLabel: "Release 2026-02",
    results: [
      {
        displayLabel: "OpenAI GPT-OSS",
        includedCount: "18 / 34 solved",
        providerLabel: "OpenAI",
        status: "mixed",
        updatedAt: "Updated Feb 2026"
      },
      {
        displayLabel: "Claude Sonnet",
        includedCount: "14 / 34 solved",
        providerLabel: "Anthropic",
        status: "mixed",
        updatedAt: "Updated Feb 2026"
      }
    ],
    summaryCards: [
      { label: "Configs", value: "02" },
      { label: "Problems", value: "34" },
      { label: "Top score", value: "18" },
      { label: "Status", value: "partial" }
    ],
    title: "Statement formalization — pilot"
  }
} as const;

/* ---------------------------------------------------------------------------
 * Team data
 * -------------------------------------------------------------------------*/

const teamMembers = [
  {
    initials: "TG",
    name: "Tom Grotius",
    role: "Founder & Lead"
  }
];

/* ---------------------------------------------------------------------------
 * Route helpers and compact section ordering
 * -------------------------------------------------------------------------*/

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

type PublicBenchmarkSummaryCard = {
  detail: string;
  label: string;
  value: string;
};

/* ---------------------------------------------------------------------------
 * Shared components
 * -------------------------------------------------------------------------*/

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
            About
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
          <a className="button button-secondary site-header-github" href={githubRepoUrl} rel="noreferrer" target="_blank">
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
            About
          </a>
          <a
            className={`site-mobile-nav-link${isBenchmarksRoute ? " site-mobile-nav-link-active" : ""}`}
            href={buildPublicUrl(benchmarksRoute)}
          >
            Benchmarks
          </a>
          <a className="site-mobile-nav-link" href={githubRepoUrl} rel="noreferrer" target="_blank">
            GitHub
          </a>
          <a className="site-mobile-nav-link" href={buildDocsUrl("README.md")} rel="noreferrer" target="_blank">
            Docs
          </a>
          <a className="button site-mobile-nav-cta" href={buildAuthUrl("/")}>
            Sign in
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
    <footer className="site-footer" aria-label="Footer">
      <div className="site-footer-grid">
        <section className="site-footer-panel">
          <h2>Explore</h2>
          <div className="site-footer-links">
            <a className="site-footer-link" href={buildPublicUrl(benchmarksRoute)}>
              Benchmarks
            </a>
            <a className="site-footer-link" href={buildPublicUrl(projectRoute)}>
              About
            </a>
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
          <h2>Connect</h2>
          <div className="site-footer-links">
            <a className="site-footer-link" href={buildAuthUrl("/")}>
              Sign in
            </a>
            <a className="site-footer-link" href={buildAccessRequestUrl()}>
              Request access
            </a>
            <a className="site-footer-link" href={githubDiscussionsUrl} rel="noreferrer" target="_blank">
              Discussions
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

/* ---------------------------------------------------------------------------
 * Home page — clean hero, key stats, value props, team
 * -------------------------------------------------------------------------*/

function PublicLanding() {
  const showInFlowSignals = useCompactLayout(640);

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
            Formal math benchmarking
          </p>
          <h1>Measure what AI can actually prove.</h1>
          <p className="site-lead">
            ParetoProof evaluates frontier AI on formal mathematical reasoning —
            proof generation, statement formalization, and more — with fully
            reproducible execution and transparent methodology.
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
          <aside className="site-signal-column" aria-label="Key numbers">
            <article className="site-signal-row">
              <span className="site-signal-value">59</span>
              <div>
                <h2>Problems evaluated</h2>
                <p>Competition-level Lean 4 proof tasks</p>
              </div>
            </article>
            <article className="site-signal-row">
              <span className="site-signal-value">3</span>
              <div>
                <h2>Model families</h2>
                <p>GPT, Claude, and Gemini under identical conditions</p>
              </div>
            </article>
            <article className="site-signal-row">
              <span className="site-signal-value">2</span>
              <div>
                <h2>Benchmark types</h2>
                <p>Proof generation and statement formalization</p>
              </div>
            </article>
          </aside>
        ) : null}
      </section>

      {showInFlowSignals ? (
        <section className="site-stat-row">
          <div className="site-stat">
            <div className="site-stat-value">59</div>
            <div className="site-stat-label">Problems evaluated</div>
          </div>
          <div className="site-stat">
            <div className="site-stat-value">3</div>
            <div className="site-stat-label">Model families</div>
          </div>
          <div className="site-stat">
            <div className="site-stat-value">2</div>
            <div className="site-stat-label">Benchmark types</div>
          </div>
        </section>
      ) : null}

      <section className="site-band-grid" aria-label="How it works">
        <article className="site-band">
          <p className="section-tag">Reproducible</p>
          <h2>Every run is verifiable</h2>
          <p>
            Versioned harness, locked inputs, and full environment metadata —
            so results are comparable across time and models.
          </p>
        </article>
        <article className="site-band">
          <p className="section-tag">Transparent</p>
          <h2>No hidden conditions</h2>
          <p>
            Results include methodology docs, scope notes, and data-quality
            flags. Partial publication is labeled, not hidden.
          </p>
        </article>
        <article className="site-band">
          <p className="section-tag">Coming soon</p>
          <h2>Docker replay</h2>
          <p>
            Containerized images where you can replay any benchmark run with
            your own API keys and verify results independently.
          </p>
        </article>
      </section>

      {/* Team section */}
      <section className="site-project-section" aria-label="Team">
        <div className="site-section-copy">
          <p className="section-tag">Team</p>
          <h2>Who is building ParetoProof</h2>
          <p className="site-lead">
            ParetoProof is an independent project focused on rigorous,
            reproducible evaluation of AI mathematical reasoning.
          </p>
        </div>
        <div className="site-team-grid">
          {teamMembers.map((member) => (
            <article className="site-team-card" key={member.name}>
              <div className="site-team-avatar" aria-hidden="true">{member.initials}</div>
              <h3>{member.name}</h3>
              <p>{member.role}</p>
            </article>
          ))}
        </div>
      </section>

      <PublicFooter isProjectRoute={false} />
    </main>
  );
}

/* ---------------------------------------------------------------------------
 * Benchmark index
 * -------------------------------------------------------------------------*/

function PublicBenchmarkIndex() {
  const isCompactLayout = useCompactLayout(480);
  const showInFlowSummary = useCompactLayout(640);

  const benchmarkIndexSummaryCards: PublicBenchmarkSummaryCard[] = [
    {
      detail: "Published benchmark releases",
      label: "Released",
      value: publicBenchmarks.length.toString().padStart(2, "0")
    },
    {
      detail: "Each card points to its latest release",
      label: "Latest",
      value: "01"
    },
    {
      detail: "Partial data is flagged, not hidden",
      label: "Quality",
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
              Latest: <strong>{benchmark.latestReleaseLabel}</strong>
              {" · "}
              Status: <strong>{formatReleaseStatus(benchmark.releaseStatus)}</strong>
            </p>
          </div>
          <a className="button button-secondary" href={buildBenchmarkReportUrl(benchmark.benchmarkVersionId)}>
            View release
          </a>
        </article>
      ))}
    </section>
  );

  const reportingRules = (
    <section className="site-band-grid" aria-label="How reporting works">
      <article className="site-band">
        <p className="section-tag">Methodology</p>
        <h2>Release-centric reporting</h2>
        <p>
          Each benchmark card links to a summary with top-line metrics,
          a methodology reference, and scope notes.
        </p>
      </article>
      <article className="site-band">
        <p className="section-tag">Portal only</p>
        <h2>Detailed evidence stays internal</h2>
        <p>
          Per-run artifacts, rerun context, and operational evidence
          are available to approved contributors in the portal.
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
            Benchmarks
          </p>
          <h1>Public benchmark releases.</h1>
          <p className="site-lead">
            Browse released benchmarks, see which models were tested,
            and open detailed release summaries.
          </p>
          <div className="hero-actions">
            <a className="button" href={buildBenchmarkReportUrl(publicBenchmarks[0].benchmarkVersionId)}>
              Latest release
            </a>
            <a className="button button-secondary" href={buildPublicUrl(projectRoute)}>
              About the project
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

/* ---------------------------------------------------------------------------
 * Benchmark report detail
 * -------------------------------------------------------------------------*/

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
              Not found
            </p>
            <h1>Benchmark report not available.</h1>
            <p className="site-lead">
              This release has not been published yet, or the report id does not match
              any current benchmark.
            </p>
            <div className="hero-actions">
              <a className="button" href={buildPublicUrl(benchmarksRoute)}>
                Browse all benchmarks
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
            Benchmark release
          </p>
          <h1>{report.title}</h1>
          <p className="site-lead">{report.description}</p>
          <div className="hero-actions">
            <a className="button" href={report.methodologyHref} rel="noreferrer" target="_blank">
              Methodology
            </a>
            <a className="button button-secondary" href={buildPublicUrl(benchmarksRoute)}>
              All benchmarks
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
          <p className="section-tag">Release</p>
          <h2>{report.releaseLabel}</h2>
          <p>
            Version: <strong>{report.benchmarkVersionId}</strong>
          </p>
          <p>
            Date: <strong>{report.dateLabel}</strong>
          </p>
        </article>
        <article className="site-band">
          <p className="section-tag">Quality</p>
          <h2>{formatReleaseStatus(report.completeness)}</h2>
          <p>
            {report.completeness === "partial"
              ? "Some rows are withheld while verification contracts are finalized."
              : "Full public release for the current benchmark package."}
          </p>
        </article>
        <article className="site-band">
          <p className="section-tag">Scope</p>
          <h2>{report.includedConfigs}</h2>
          <p>
            Status: <strong>{formatReleaseStatus(report.latestStatus)}</strong>
          </p>
        </article>
      </section>

      <section className="site-project-section" aria-label="Results by model">
        <div className="site-section-copy">
          <p className="section-tag">Results</p>
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
                  Solved: <strong>{row.includedCount}</strong>
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

/* ---------------------------------------------------------------------------
 * Project / About page
 * -------------------------------------------------------------------------*/

const contributorSteps: Array<{
  body: string;
  icon: AppIconName;
  kicker: string;
  title: string;
}> = [
  {
    body:
      "Read about the project, benchmarks, and methodology so you understand the scope before requesting access.",
    icon: "compass",
    kicker: "Step 1",
    title: "Learn the project"
  },
  {
    body:
      "Approved contributors sign in via GitHub or Google through the dedicated auth surface.",
    icon: "key",
    kicker: "Step 2",
    title: "Sign in"
  },
  {
    body:
      "New collaborators submit an access request that goes through manual review.",
    icon: "users",
    kicker: "Step 3",
    title: "Request access"
  },
  {
    body:
      "Once approved, all benchmark work, profile management, and admin tools live in the portal.",
    icon: "server",
    kicker: "Step 4",
    title: "Work in the portal"
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
      "Public questions about the project, methodology, or results go to GitHub Discussions.",
    external: true,
    href: githubDiscussionsUrl,
    icon: "github",
    label: "Open discussions",
    title: "GitHub Discussions"
  },
  {
    body:
      "Approved contributors sign in through the auth surface, not public threads.",
    href: buildAuthUrl("/"),
    icon: "key",
    label: "Sign in",
    title: "Contributor sign-in"
  },
  {
    body:
      "First-time collaborators go through the dedicated access-request path.",
    href: buildAccessRequestUrl(),
    icon: "users",
    label: "Request access",
    title: "New collaborator intake"
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
    body: "How benchmarks are designed, executed, and scored.",
    external: true,
    href: buildDocsUrl("benchmarks.md"),
    icon: "flask",
    label: "Read methodology",
    title: "Benchmark methodology"
  },
  {
    body: "How the public site, auth, portal, API, and workers fit together.",
    external: true,
    href: buildDocsUrl("architecture.md"),
    icon: "spark",
    label: "Read architecture",
    title: "Architecture"
  },
  {
    body: "Index of all project documentation.",
    external: true,
    href: buildDocsUrl("README.md"),
    icon: "server",
    label: "Open docs",
    title: "Documentation index"
  }
];

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
        <p className="section-tag">Overview</p>
        <h2>What is ParetoProof?</h2>
        <p className="site-lead">
          A reproducible benchmark platform for evaluating frontier AI on formal
          mathematical tasks — with transparent methodology and verifiable results.
        </p>
      </div>

      <div className="site-editorial-grid">
        <div className="site-editorial-copy">
          <p>
            ParetoProof measures what frontier AI systems can actually do on competition-level
            mathematical proofs and formalizations in Lean 4. Every run is tied to a versioned
            harness with locked inputs and full environment metadata.
          </p>
          <p>
            The project focuses on reproducibility over headline numbers. Results are released
            with methodology docs, scope notes, and quality flags — partial publication is
            labeled, never hidden.
          </p>
        </div>
        <div className="site-topic-list" aria-label="Key points">
          <article className="site-topic-item">
            <h3>Mission</h3>
            <p>Rigorous, reproducible evaluation of AI mathematical reasoning capabilities.</p>
          </article>
          <article className="site-topic-item">
            <h3>Approach</h3>
            <p>Versioned benchmark packages, identical conditions across models, public release tracking.</p>
          </article>
          <article className="site-topic-item">
            <h3>Status</h3>
            <p>Active development. Two benchmark types released, with more planned.</p>
          </article>
        </div>
      </div>
    </article>
  );

  const packCoverage = [
    {
      detail: "Mission, approach, and current status",
      label: "Overview",
      value: "01"
    },
    {
      detail: "How to join as a contributor",
      label: "Contributor path",
      value: "02"
    },
    {
      detail: "Where to ask questions and get help",
      label: "Contact",
      value: "03"
    }
  ];

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
        <p className="section-tag">Contribute</p>
        <h2>How to get involved</h2>
        <p className="site-lead">
          Contributors go through a manual approval process. Once approved, all
          work happens inside the portal.
        </p>
      </div>

      {isCompactLayout ? (
        <div className="hero-actions">
          <a className="button" href={buildAuthUrl("/")}>
            Sign in
          </a>
          <a className="button button-secondary" href={buildAccessRequestUrl()}>
            Request access
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
            Sign in
          </a>
          <a className="button button-secondary" href={buildAccessRequestUrl()}>
            Request access
          </a>
          <a className="button button-secondary" href={githubDiscussionsUrl}>
            Ask a question
          </a>
        </div>
      ) : null}
    </article>
  );

  const contactSection = (
    <article className="site-project-section" id="contact">
      <div className="site-section-copy">
        <p className="section-tag">Contact</p>
        <h2>Get in touch</h2>
        <p className="site-lead">
          Public questions go to GitHub Discussions. Access requests and account
          recovery are handled through the auth surface.
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
    </article>
  );

  const resourcesSection = (
    <article className="site-project-section">
      <div className="site-section-copy">
        <p className="section-tag">Resources</p>
        <h2>Documentation</h2>
        <p className="site-lead">
          Methodology docs, architecture overview, and project documentation.
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
            About
          </p>
          <h1>About ParetoProof.</h1>
          <p className="site-lead">
            What the project is, how to contribute, and where to direct questions.
          </p>

          <div className="site-pill-row" aria-label="Page sections">
            <a className="site-pill-link" href="#overview">
              Overview
            </a>
            <a className="site-pill-link" href="#contributors">
              Contribute
            </a>
            <a className="site-pill-link" href="#contact">
              Contact
            </a>
          </div>
        </div>

        {!showInFlowCoverage ? (
          <aside className="site-signal-column" aria-label="Page coverage">
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

      <section className="site-section-stack" aria-label="About sections">
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

/* ---------------------------------------------------------------------------
 * Router
 * -------------------------------------------------------------------------*/

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
