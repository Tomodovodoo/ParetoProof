import { buildAuthUrl } from "../lib/surface";

export function PublicSite() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">ParetoProof</p>
          <p className="site-tagline">Formal benchmark infrastructure for theorem proving systems.</p>
        </div>
        <a className="button button-secondary" href={buildAuthUrl("/")}>
          Log in
        </a>
      </header>

      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Public Site</p>
          <h1>Measure real progress on formal mathematical reasoning.</h1>
          <p>
            ParetoProof is building a benchmark platform for Lean-based theorem
            proving systems, with reproducible runs, audited access control, and
            a private portal for contributors.
          </p>
          <div className="hero-actions">
            <a className="button" href={buildAuthUrl("/")}>
              Enter the portal
            </a>
            <a className="button button-secondary" href="/benchmarks">
              View benchmark overview
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
