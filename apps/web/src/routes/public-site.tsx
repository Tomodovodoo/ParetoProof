import { AppIcon } from "../components/app-icon";
import { buildAuthUrl } from "../lib/surface";

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

export function PublicSite() {
  return (
    <main className="site-shell">
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
        <a className="button button-secondary" href={buildAuthUrl("/")}>
          Contributor sign in
        </a>
      </header>

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
            <a className="button" href={buildAuthUrl("/")}>
              Enter the portal
            </a>
            <a className="button button-secondary" href="/benchmarks">
              Read the benchmark model
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
